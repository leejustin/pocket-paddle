import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOUNCE_LEAD, EARLY, LATE, POINT_PAUSE, flightFor, newRally, parseMessage, receive, swing, tick } from '../src/rally.ts';
import type { Effect, Message, Rally } from '../src/rally.ts';

const shot = (time: number, power = 0.5, mishit = false) => ({ time, power, mishit });
const sent = (effects: Effect[]) => effects.flatMap(effect => effect.kind === 'send' ? [effect.message] : []);
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
	const incoming = deliver(receiver, [{ t: 'hit', n: 1, flight: 1000 }], 0).rally;
	const early = swing(incoming, shot(1000 - EARLY - 50), 1000 - EARLY - 50);
	assert.equal(early.played, false, 'too early, the ball is not there yet');
	assert.equal(early.rally, incoming);
	const away = swing(newRally(true), shot(0), 0).rally;
	assert.equal(swing(away, shot(200), 200).played, false, 'the ball is heading to the other phone');
});

test('the bounce cue plays once, just before the ball arrives', () => {
	let rally = deliver(newRally(false), [{ t: 'hit', n: 1, flight: 1000 }], 0).rally;
	let cues = 0;
	for (let now = 0; now < 1000 + LATE; now += 16) {
		const step = tick(rally, now);
		rally = step.rally;
		if (sounds(step.effects).includes('bounce')) {
			cues++;
			assert.ok(now >= 1000 - BOUNCE_LEAD && now < 1000 - BOUNCE_LEAD + 16);
		}
	}
	assert.equal(cues, 1);
});

test('a ball nobody swings at is a miss: the other phone wins the point and serves', () => {
	let a = swing(newRally(true), shot(0), 0).rally;
	let b = deliver(newRally(false), [{ t: 'hit', n: 1, flight: 1000 }], 0).rally;
	const missed = tick(b, 1000 + LATE + 1);
	b = missed.rally;
	assert.deepEqual(sounds(missed.effects), ['dead-ball']);
	assert.deepEqual(sent(missed.effects), [{ t: 'end', why: 'miss' }]);
	assert.deepEqual([b.me, b.them], [0, 1]);
	a = deliver(a, sent(missed.effects), 1300).rally;
	assert.deepEqual([a.me, a.them, a.best], [1, 0, 1]);
	a = tick(a, 1300 + POINT_PAUSE).rally;
	b = tick(b, 1000 + LATE + 1 + POINT_PAUSE).rally;
	assert.deepEqual(a.phase, { kind: 'serve', mine: true });
	assert.deepEqual(b.phase, { kind: 'serve', mine: false });
});

test('catching the edge sends the ball out and loses the point', () => {
	const incoming = deliver(newRally(false), [{ t: 'hit', n: 3, flight: 1000 }], 0).rally;
	const out = swing(incoming, shot(1000, 0.6, true), 1000);
	assert.equal(out.played, true, 'you still hear the clack');
	assert.deepEqual(sent(out.effects), [{ t: 'end', why: 'out' }]);
	assert.equal(out.rally.them, 1);
	assert.equal(out.rally.phase.kind, 'point');
});

test('a late swing still counts until the window closes', () => {
	const incoming = deliver(newRally(false), [{ t: 'hit', n: 1, flight: 1000 }], 0).rally;
	assert.equal(swing(incoming, shot(1000 + LATE), 1000 + LATE).played, true);
	assert.equal(swing(incoming, shot(1000 + LATE + 1), 1000 + LATE + 1).played, false);
});

test('network delay is measured and taken off the ball flight', () => {
	let rally = newRally(false);
	rally = receive(rally, { t: 'pong', at: 0 }, 60).rally;
	assert.equal(rally.latency, 30);
	rally = receive(rally, { t: 'hit', n: 1, flight: 1000 }, 500).rally;
	assert.equal(rally.phase.kind === 'incoming' && rally.phase.arrival, 500 + 1000 - 30);
	assert.deepEqual(sent(receive(newRally(true), { t: 'ping', at: 7 }, 9).effects), [{ t: 'pong', at: 7 }]);
});

test('harder shots fly faster', () => {
	assert.ok(flightFor(1) < flightFor(0.5));
	assert.ok(flightFor(0) <= 1500 && flightFor(1) >= 800);
});

test('malformed or unknown messages are dropped', () => {
	assert.equal(parseMessage('not json'), undefined);
	assert.equal(parseMessage('{"t":"hit","n":"1","flight":900}'), undefined);
	assert.equal(parseMessage('{"t":"end","why":"forfeit"}'), undefined);
	assert.equal(parseMessage('{"t":"launch-missiles"}'), undefined);
	assert.deepEqual(parseMessage('{"t":"hello","v":1,"name":"Paddle 4821"}'), { t: 'hello', v: 1, name: 'Paddle 4821' });
});
