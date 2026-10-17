import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOUNCE_LEAD, EARLY, FIRST_BEAT, LATE, POINT_PAUSE, flightFor, newRally, parseMessage, receive, swing, tick } from '../src/rally.ts';
import type { Effect, Message, Rally } from '../src/rally.ts';

const shot = (time: number, power = 0.5, mishit = false) => ({ time, power, mishit });
const sent = (effects: Effect[]) => effects.flatMap(effect => effect.kind === 'send' ? [effect.message] : []);
const buzzes = (effects: Effect[]) => effects.flatMap(effect => effect.kind === 'buzz' ? [effect.name] : []);
const sounds = (effects: Effect[]) => effects.flatMap(effect => effect.kind === 'sound' ? [effect.name] : []);

/** Delivers everything one phone sent to the other, as JSON over the wire would. */
function deliver(to: Rally, messages: Message[], now: number) {
	let rally = to;
	const effects: Effect[] = [];
	for (const message of messages) {
		const step = receive(rally, parseMessage(JSON.stringify(message))!, now);
		rally = step.rally;
		effects.push(...step.effects);
	}
	return { rally, effects };
}

test('the server swings, the ball flies, and the other phone returns it in time', () => {
	let a = newRally(true);
	let b = newRally(false);
	const serve = swing(a, shot(0, 0.5), 0);
	assert.equal(serve.played, true);
	a = serve.rally;
	b = deliver(b, sent(serve.effects), 10).rally;
	assert.equal(b.phase.kind, 'incoming');
	const arrival = 10 + flightFor(0.5);
	const back = swing(b, shot(arrival - 100, 0.8), arrival - 100);
	assert.equal(back.played, true);
	assert.deepEqual(sent(back.effects), [{ t: 'hit', n: 2, flight: flightFor(0.8) }]);
	a = deliver(a, sent(back.effects), arrival).rally;
	assert.equal(a.phase.kind, 'incoming');
	assert.equal(a.count, 2);
});

test('swinging at thin air stays silent and changes nothing', () => {
	const receiver = newRally(false);
	assert.equal(swing(receiver, shot(0), 0).played, false, 'not your serve');
	const incoming = deliver(receiver, [{ t: 'hit', n: 1, flight: 2500 }], 0).rally;
	const early = swing(incoming, shot(2500 - EARLY - 50), 2500 - EARLY - 50);
	assert.equal(early.played, false, 'too early, the ball is not there yet');
	assert.equal(early.rally, incoming);
	const away = swing(newRally(true), shot(0), 0).rally;
	assert.equal(swing(away, shot(200), 200).played, false, 'the ball is heading to the other phone');
});

test('the bounce cue plays once, just before the ball arrives', () => {
	let rally = deliver(newRally(false), [{ t: 'hit', n: 1, flight: 2500 }], 0).rally;
	let cues = 0;
	for (let now = 0; now < 2500 + LATE; now += 16) {
		const step = tick(rally, now);
		rally = step.rally;
		if (sounds(step.effects).includes('bounce')) {
			cues++;
			assert.ok(now >= 2500 - BOUNCE_LEAD && now < 2500 - BOUNCE_LEAD + 16);
		}
	}
	assert.equal(cues, 1);
});

test('a ball nobody swings at is a miss: the other phone wins the point and serves', () => {
	let a = swing(newRally(true), shot(0), 0).rally;
	let b = deliver(newRally(false), [{ t: 'hit', n: 1, flight: 2500 }], 0).rally;
	const missed = tick(b, 2500 + LATE + 1);
	b = missed.rally;
	assert.deepEqual(sounds(missed.effects), ['dead-ball']);
	assert.deepEqual(sent(missed.effects), [{ t: 'end', why: 'miss' }]);
	assert.deepEqual([b.me, b.them], [0, 1]);
	a = deliver(a, sent(missed.effects), 3800).rally;
	assert.deepEqual([a.me, a.them, a.best], [1, 0, 1]);
	a = tick(a, 3800 + POINT_PAUSE).rally;
	b = tick(b, 2500 + LATE + 1 + POINT_PAUSE).rally;
	assert.deepEqual(a.phase, { kind: 'serve', mine: true });
	assert.deepEqual(b.phase, { kind: 'serve', mine: false });
});

test('catching the edge sends the ball out and loses the point', () => {
	const incoming = deliver(newRally(false), [{ t: 'hit', n: 3, flight: 2500 }], 0).rally;
	const out = swing(incoming, shot(2500, 0.6, true), 2500);
	assert.equal(out.played, true, 'you still hear the clack');
	assert.deepEqual(sent(out.effects), [{ t: 'end', why: 'out' }]);
	assert.equal(out.rally.them, 1);
	assert.equal(out.rally.phase.kind, 'point');
});

test('a late swing still counts until the window closes', () => {
	const incoming = deliver(newRally(false), [{ t: 'hit', n: 1, flight: 2500 }], 0).rally;
	assert.equal(swing(incoming, shot(2500 + LATE), 2500 + LATE).played, true);
	assert.equal(swing(incoming, shot(2500 + LATE + 1), 2500 + LATE + 1).played, false);
});

test('network delay is measured and taken off the ball flight', () => {
	let rally = newRally(false);
	rally = receive(rally, { t: 'pong', at: 0 }, 60).rally;
	assert.equal(rally.latency, 30);
	rally = receive(rally, { t: 'hit', n: 1, flight: 2500 }, 500).rally;
	assert.equal(rally.phase.kind === 'incoming' && rally.phase.arrival, 500 + 2500 - 30);
	assert.deepEqual(sent(receive(newRally(true), { t: 'ping', at: 7 }, 9).effects), [{ t: 'pong', at: 7 }]);
});

test('harder shots fly faster, and every ball takes a couple of seconds to arrive', () => {
	assert.ok(flightFor(1) < flightFor(0.5));
	assert.ok(flightFor(0) <= 3200 && flightFor(1) >= 2000);
});

test('the window to hit is generous: well before the ball arrives, and a second after', () => {
	const incoming = deliver(newRally(false), [{ t: 'hit', n: 1, flight: flightFor(1) }], 0).rally;
	const arrival = flightFor(1);
	assert.ok(EARLY + LATE >= 2500, 'at least two and a half seconds to swing');
	assert.ok(arrival - EARLY > 0, 'even the fastest ball gives the window time to open after it is hit');
	assert.equal(swing(incoming, shot(arrival - 1400), arrival - 1400).played, true, 'early swing');
	assert.equal(swing(incoming, shot(arrival + 900), arrival + 900).played, true, 'late swing');
});

test('malformed or unknown messages are dropped', () => {
	assert.equal(parseMessage('not json'), undefined);
	assert.equal(parseMessage('{"t":"hit","n":"1","flight":900}'), undefined);
	assert.equal(parseMessage('{"t":"end","why":"forfeit"}'), undefined);
	assert.equal(parseMessage('{"t":"launch-missiles"}'), undefined);
	assert.deepEqual(parseMessage('{"t":"hello","v":1,"name":"Paddle 4821"}'), { t: 'hello', v: 1, name: 'Paddle 4821' });
});

test('the phone buzzes the ball in: a tap, a double tap when you can swing, a quickening pulse, then a thump on the bounce', () => {
	const arrival = 2500;
	const hit = deliver(newRally(false), [{ t: 'hit', n: 1, flight: arrival }], 0);
	assert.deepEqual(buzzes(hit.effects), ['coming']);
	let rally = hit.rally;
	const felt: { name: string; at: number }[] = [];
	for (let now = 0; now <= arrival + LATE; now += 16) {
		const step = tick(rally, now);
		rally = step.rally;
		for (const name of buzzes(step.effects)) felt.push({ name, at: now });
	}
	const names = felt.map(cue => cue.name);
	assert.equal(names[0], 'open');
	assert.ok(felt[0].at >= arrival - EARLY && felt[0].at < arrival - EARLY + 16, 'opens with the window');
	assert.equal(names.at(-1), 'now', 'ends on the bounce');
	assert.ok(felt.at(-1)!.at >= arrival - BOUNCE_LEAD && felt.at(-1)!.at < arrival - BOUNCE_LEAD + 16);
	const beats = felt.filter(cue => cue.name === 'beat').map(cue => cue.at);
	assert.ok(beats.length >= 3, 'a few heartbeats between the window opening and the bounce');
	assert.ok(beats[0] - felt[0].at >= FIRST_BEAT - 16);
	const gaps = beats.slice(1).map((at, index) => at - beats[index]);
	assert.ok(gaps.every((gap, index) => index === 0 || gap <= gaps[index - 1]), 'the pulse quickens');
});
