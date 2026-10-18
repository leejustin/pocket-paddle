import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EARLY, LATE, POINT_PAUSE, flightFor } from '../src/rally.ts';
import { HOST, newSeat, parseGuestMessage, parseHostMessage, refereeSwing, refereeTick, seatCanHit, seatReceive, seatStatus, seatSwing, seatTick, startGame } from '../src/doubles.ts';
import type { HostMessage, Out, Player, Referee, Seat } from '../src/doubles.ts';

const players: Player[] = [
	{ id: HOST, name: 'Host', team: 0 },
	{ id: 'p2', name: 'Pat', team: 0 },
	{ id: 'o1', name: 'Olive', team: 1 },
	{ id: 'o2', name: 'Otto', team: 1 },
];
const hit = (power = 0.5, mishit = false) => ({ power, mishit });
const messages = (out: Out[]) => out.map(entry => entry.message);
/** Feeds everything the referee said (to everyone, or to this seat) through a seat, as JSON over the wire would. */
function feed(seat: Seat, out: Out[], now: number) {
	let current = seat;
	const effects = [];
	for (const entry of out) {
		if (entry.to && entry.to !== current.me) continue;
		const step = seatReceive(current, parseHostMessage(JSON.stringify(entry.message))!, now);
		current = step.seat;
		effects.push(...step.effects);
	}
	return { seat: current, effects };
}

test('starting sends each phone its own roster, then the host serves', () => {
	const { referee, out } = startGame(players);
	assert.deepEqual(referee.phase, { kind: 'serve', server: HOST });
	assert.deepEqual(out.filter(entry => entry.message.t === 'roster').map(entry => entry.to), [HOST, 'p2', 'o1', 'o2']);
	assert.deepEqual(out.at(-1), { message: { t: 'serve', server: HOST, score: [0, 0] } });
	const seat = feed(newSeat('o1'), out, 0).seat;
	assert.equal(seat.me, 'o1');
	assert.equal(seatStatus(seat, false), 'Host serves');
});

test('only the server can serve, and the ball goes to the other team', () => {
	let { referee } = startGame(players);
	assert.deepEqual(refereeSwing(referee, 'o1', hit(), 0, 0).out, [], 'not their serve');
	const served = refereeSwing(referee, HOST, hit(0.5), 0, 0);
	referee = served.referee;
	assert.deepEqual(messages(served.out), [{ t: 'ball', n: 1, flight: flightFor(0.5), to: 1, by: HOST }]);
	assert.deepEqual(refereeSwing(referee, 'p2', hit(), flightFor(0.5), flightFor(0.5)).out, [], 'your own team cannot hit it');
});

test('either opponent can return it; the first swing wins and the partner’s is ignored', () => {
	let { referee } = startGame(players);
	referee = refereeSwing(referee, HOST, hit(0.5), 0, 0).referee;
	const arrival = flightFor(0.5);
	const back = refereeSwing(referee, 'o2', hit(1), arrival - 200, arrival - 150);
	assert.deepEqual(messages(back.out), [{ t: 'ball', n: 2, flight: flightFor(1), to: 0, by: 'o2' }]);
	referee = back.referee;
	assert.deepEqual(refereeSwing(referee, 'o1', hit(), arrival - 100, arrival - 90).out, [], 'too late, partner already hit it');
	// Now the host's partner returns it.
	const again = refereeSwing(referee, 'p2', hit(), arrival - 150 + flightFor(1), arrival - 140 + flightFor(1));
	assert.equal(messages(again.out)[0].t, 'ball');
	assert.equal(again.referee.count, 3);
});

test('the window is as generous as one-on-one, and swings outside it do nothing', () => {
	let { referee } = startGame(players);
	referee = refereeSwing(referee, HOST, hit(0.5), 0, 0).referee;
	const arrival = flightFor(0.5);
	assert.deepEqual(refereeSwing(referee, 'o1', hit(), arrival - EARLY - 10, arrival - EARLY - 10).out, [], 'too early');
	assert.equal(refereeSwing(referee, 'o1', hit(), arrival - EARLY, arrival).out.length, 1);
	assert.equal(refereeSwing(referee, 'o1', hit(), arrival + LATE, arrival + LATE + 120).out.length, 1, 'a late swing still in transit counts');
});

test('a ball nobody returns is the hitting team’s point; then they serve, taking turns', () => {
	let { referee } = startGame(players);
	referee = refereeSwing(referee, HOST, hit(0.5), 0, 0).referee;
	const arrival = flightFor(0.5);
	assert.deepEqual(refereeTick(referee, arrival + LATE).out, [], 'waits for swings still in transit');
	const missed = refereeTick(referee, arrival + LATE + 1000);
	assert.deepEqual(messages(missed.out), [{ t: 'point', winner: 0, why: 'miss', score: [1, 0], best: 1 }]);
	referee = missed.referee;
	const next = refereeTick(referee, arrival + LATE + 1000 + POINT_PAUSE);
	assert.deepEqual(messages(next.out), [{ t: 'serve', server: 'p2', score: [1, 0] }], 'the host’s partner serves next');
	referee = next.referee;
	// Team 1 wins the next point, so it serves: Olive first, then Otto.
	referee = refereeSwing(referee, 'p2', hit(), 0, 10_000).referee;
	referee = refereeSwing(referee, 'o1', hit(0.2, true), 10_000 + flightFor(0.5), 10_000 + flightFor(0.5)).referee;
	assert.deepEqual(referee.score, [2, 0], 'catching the edge gives the point away');
	const serves: string[] = [];
	const loseOnPurpose = (ref: Referee, now: number) => {
		let r = refereeTick(ref, now + POINT_PAUSE).referee;
		assert.equal(r.phase.kind, 'serve');
		serves.push((r.phase as { server: string }).server);
		r = refereeSwing(r, serves.at(-1)!, hit(), now + POINT_PAUSE, now + POINT_PAUSE).referee;
		return refereeTick(r, now + POINT_PAUSE + 10_000).referee;
	};
	referee = loseOnPurpose(referee, 20_000);
	referee = loseOnPurpose(referee, 40_000);
	referee = loseOnPurpose(referee, 60_000);
	assert.deepEqual(serves, [HOST, 'p2', HOST], 'team 0 keeps winning, so its two players alternate');
	assert.deepEqual(referee.score, [5, 0]);
});

test('every seat sees the same game: the ball buzzes in on the receiving team, the score matches', () => {
	const start = startGame(players);
	let referee = start.referee;
	let seats = players.map(player => feed(newSeat(player.id), start.out, 0).seat);
	const served = refereeSwing(referee, HOST, hit(0.5), 0, 0);
	referee = served.referee;
	const after = seats.map(seat => feed(seat, served.out, 20));
	seats = after.map(step => step.seat);
	assert.deepEqual(seats.map(seat => seat.phase.kind), ['away', 'away', 'incoming', 'incoming']);
	assert.deepEqual(after.map(step => step.effects.filter(effect => effect.kind === 'buzz').length), [0, 0, 1, 1]);
	// Olive feels the window open and can hit; the host's team can't.
	const arrival = 20 + flightFor(0.5);
	const olive = seatTick(seats[2], arrival - EARLY);
	assert.deepEqual(olive.effects, [{ kind: 'buzz', name: 'open' }]);
	assert.equal(seatCanHit(seats[2], arrival - 300), true);
	assert.equal(seatCanHit(seats[0], arrival - 300), false);
	// Olive swings: she hears the pop, the cues stop, and the host gets the swing.
	const swung = seatSwing(seats[2], { power: 0.7, mishit: false, time: arrival - 300 });
	assert.equal(swung.played, true);
	assert.deepEqual(swung.send, { t: 'swing', power: 0.7, mishit: false });
	assert.deepEqual(seatTick(swung.seat, arrival - 100).effects, []);
	// Nobody returns her shot: team 1's point, and every seat agrees.
	referee = refereeSwing(referee, 'o1', swung.send as { power: number; mishit: boolean }, arrival - 300, arrival - 280).referee;
	const missed = refereeTick(referee, 1e6);
	seats = seats.map(seat => feed(seat, missed.out, 1e6).seat);
	assert.deepEqual(seats.map(seat => seat.score), Array(4).fill([0, 1]));
	assert.deepEqual(seats.map(seat => seat.phase.kind === 'point' && seat.phase.won), [false, false, true, true]);
});

test('friends answer the host’s pings, and malformed messages are dropped', () => {
	assert.deepEqual(seatReceive(newSeat('o1'), { t: 'ping', at: 5 }, 9).effects, [{ kind: 'send', message: { t: 'pong', at: 5 } }]);
	assert.equal(parseHostMessage('{"t":"ball","n":1,"flight":2000,"to":2,"by":"host"}'), undefined);
	assert.equal(parseHostMessage('{"t":"roster","v":1,"you":"x","players":[{"id":"a","name":"A","team":0}],"extra":1}')?.t, 'roster');
	assert.equal(parseHostMessage('{"t":"roster","v":1,"you":"x","players":[1,2,3,4,5]}'), undefined);
	assert.deepEqual(parseGuestMessage('{"t":"swing","power":7,"mishit":false}'), { t: 'swing', power: 1, mishit: false });
	assert.equal(parseGuestMessage('{"t":"swing","power":0.5}'), undefined);
	assert.equal(parseGuestMessage('nope'), undefined);
	const message: HostMessage = { t: 'point', winner: 1, why: 'out', score: [2, 3], best: 4 };
	assert.deepEqual(parseHostMessage(JSON.stringify(message)), message);
});
