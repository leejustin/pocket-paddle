import { LATE, MAX_LATENCY, POINT_PAUSE, clamp, cues, flightFor, inWindow, incoming } from './rally.ts';
import type { Buzz, EndReason, Incoming } from './rally';

/**
 * Doubles: four phones, two teams. The host phone is the referee: friends send it their swings,
 * it decides every shot and point, and it tells all four phones what happened. Each phone keeps a
 * `Seat`, its own view of the game built only from the host's messages (the host feeds its own
 * messages to its seat too). Pure: callers pass in time and carry out the returned effects.
 */
export const DOUBLES = 1;
/** The host's player id. Friends get the peer ids of their connections. */
export const HOST = 'host';
/** Extra time (ms) the referee waits after the window closes, for a friend's last-moment swing to arrive. */
const GRACE = MAX_LATENCY + 100;

export type Team = 0 | 1;
export type Player = { id: string; name: string; team: Team };
export type Score = [number, number];

/** Host to phones. */
export type HostMessage =
	| { t: 'roster'; v: number; you: string; players: Player[] }
	| { t: 'serve'; server: string; score: Score }
	/** `flight` is how long (ms) until the ball reaches team `to`, counted from when the host sent it. */
	| { t: 'ball'; n: number; flight: number; to: Team; by: string }
	| { t: 'point'; winner: Team; why: EndReason; score: Score; best: number }
	| { t: 'ping'; at: number }
	| { t: 'pong'; at: number };
/** Phones to host. */
export type GuestMessage =
	| { t: 'hello'; v: number; name: string }
	| { t: 'swing'; power: number; mishit: boolean }
	| { t: 'ping'; at: number }
	| { t: 'pong'; at: number };
/** `to` is a player id; without it the message goes to everyone, the host's own seat included. */
export type Out = { to?: string; message: HostMessage };

// The referee, on the host phone.

export type Referee = {
	players: Player[];
	score: Score;
	/** Shots in the current rally, and the longest rally so far. */
	count: number;
	best: number;
	/** Which player of each team serves next time that team gets the serve. */
	turn: [number, number];
	phase:
		| { kind: 'serve'; server: string }
		| { kind: 'flight'; to: Team; arrival: number }
		| { kind: 'point'; winner: Team; until: number };
};

export function teammates(players: Player[], team: Team): Player[] {
	return players.filter(player => player.team === team);
}

/** Starts the game: the host's team serves first, the host first of all. */
export function startGame(players: Player[]): { referee: Referee; out: Out[] } {
	const server = teammates(players, 0)[0]?.id ?? HOST;
	const referee: Referee = { players, score: [0, 0], count: 0, best: 0, turn: [1, 0], phase: { kind: 'serve', server } };
	const out: Out[] = players.map(player => ({ to: player.id, message: { t: 'roster', v: DOUBLES, you: player.id, players } }));
	out.push({ message: { t: 'serve', server, score: [0, 0] } });
	return { referee, out };
}

function teamOf(referee: Referee, id: string): Team | undefined {
	return referee.players.find(player => player.id === id)?.team;
}

function launch(referee: Referee, by: string, team: Team, power: number, now: number, count: number): { referee: Referee; out: Out[] } {
	const to: Team = team === 0 ? 1 : 0;
	const flight = flightFor(power);
	return {
		referee: { ...referee, count, phase: { kind: 'flight', to, arrival: now + flight } },
		out: [{ message: { t: 'ball', n: count, flight, to, by } }],
	};
}

function point(referee: Referee, winner: Team, why: EndReason, now: number): { referee: Referee; out: Out[] } {
	const score: Score = [...referee.score];
	score[winner]++;
	const best = Math.max(referee.best, referee.count);
	return {
		referee: { ...referee, score, best, phase: { kind: 'point', winner, until: now + POINT_PAUSE } },
		out: [{ message: { t: 'point', winner, why, score, best } }],
	};
}

/**
 * A swing by `id` that happened at `at` (host clock), handled at `now`. The first player on the
 * receiving team to meet the ball returns it; anything else (a partner's late swing, the other team) is ignored.
 */
export function refereeSwing(referee: Referee, id: string, shot: { power: number; mishit: boolean }, at: number, now: number): { referee: Referee; out: Out[] } {
	const team = teamOf(referee, id);
	const { phase } = referee;
	if (team === undefined) return { referee, out: [] };
	if (phase.kind === 'serve' && phase.server === id) return launch(referee, id, team, shot.power, now, 1);
	if (phase.kind !== 'flight' || phase.to !== team || !inWindow(phase.arrival, at)) return { referee, out: [] };
	// Catching the edge sends the ball out: the other team wins the point.
	if (shot.mishit) return point(referee, team === 0 ? 1 : 0, 'out', now);
	return launch(referee, id, team, shot.power, now, referee.count + 1);
}

/** Advances the referee: a ball nobody returned, and the next serve after a point. */
export function refereeTick(referee: Referee, now: number): { referee: Referee; out: Out[] } {
	const { phase } = referee;
	if (phase.kind === 'flight' && now > phase.arrival + LATE + GRACE) return point(referee, phase.to === 0 ? 1 : 0, 'miss', now);
	if (phase.kind === 'point' && now >= phase.until) {
		// The team that won the point serves, taking turns between its two players.
		const team = phase.winner;
		const players = teammates(referee.players, team);
		const server = players[referee.turn[team] % Math.max(1, players.length)]?.id ?? HOST;
		const turn: [number, number] = [...referee.turn];
		turn[team]++;
		return {
			referee: { ...referee, turn, count: 0, phase: { kind: 'serve', server } },
			out: [{ message: { t: 'serve', server, score: referee.score } }],
		};
	}
	return { referee, out: [] };
}

// A seat: one phone's view of the game.

export type SeatPhase =
	| { kind: 'waiting' }
	| { kind: 'serve'; server: string }
	| { kind: 'away'; launched: number; flight: number; by: string }
	/** `swung` stops the cues once you've swung, while the host decides. */
	| (Incoming & { by: string; swung: boolean })
	| { kind: 'point'; won: boolean; why: EndReason };
export type Seat = { me: string; players: Player[]; score: Score; count: number; best: number; latency: number; phase: SeatPhase };
export type SeatEffect =
	| { kind: 'send'; message: GuestMessage }
	| { kind: 'buzz'; name: Buzz }
	| { kind: 'sound'; name: 'bounce' | 'dead-ball' }
	| { kind: 'point'; won: boolean };

export function newSeat(me: string, players: Player[] = []): Seat {
	return { me, players, score: [0, 0], count: 0, best: 0, latency: 0, phase: { kind: 'waiting' } };
}

export function myTeam(seat: Seat): Team {
	return seat.players.find(player => player.id === seat.me)?.team ?? 0;
}

export function nameOf(seat: Seat, id: string): string {
	return seat.players.find(player => player.id === id)?.name ?? 'Someone';
}

export function seatReceive(seat: Seat, message: HostMessage, now: number): { seat: Seat; effects: SeatEffect[] } {
	switch (message.t) {
		case 'roster':
			return { seat: { ...seat, me: message.you, players: message.players }, effects: [] };
		case 'serve':
			return { seat: { ...seat, score: message.score, count: 0, phase: { kind: 'serve', server: message.server } }, effects: [] };
		case 'ball': {
			const flight = clamp(message.flight, 300, 5000);
			if (message.to !== myTeam(seat)) {
				return { seat: { ...seat, count: message.n, phase: { kind: 'away', launched: now, flight, by: message.by } }, effects: [] };
			}
			const phase = { ...incoming(now, now + flight - seat.latency), by: message.by, swung: false };
			return { seat: { ...seat, count: message.n, phase }, effects: [{ kind: 'buzz', name: 'coming' }] };
		}
		case 'point': {
			const won = message.winner === myTeam(seat);
			const effects: SeatEffect[] = won || message.why === 'out' ? [] : [{ kind: 'sound', name: 'dead-ball' }];
			effects.push({ kind: 'point', won });
			return { seat: { ...seat, score: message.score, best: message.best, phase: { kind: 'point', won, why: message.why } }, effects };
		}
		case 'ping':
			return { seat, effects: [{ kind: 'send', message: { t: 'pong', at: message.at } }] };
		case 'pong': {
			const oneWay = clamp((now - message.at) / 2, 0, MAX_LATENCY);
			return { seat: { ...seat, latency: seat.latency === 0 ? oneWay : seat.latency * 0.7 + oneWay * 0.3 }, effects: [] };
		}
	}
}

/** The swing cues for a ball coming at your team. Misses are the host's call, so nothing else happens here. */
export function seatTick(seat: Seat, now: number): { seat: Seat; effects: SeatEffect[] } {
	const { phase } = seat;
	if (phase.kind !== 'incoming' || phase.swung) return { seat, effects: [] };
	const due = cues(phase, now);
	return due ? { seat: { ...seat, phase: due.phase }, effects: due.effects } : { seat, effects: [] };
}

export function seatCanHit(seat: Seat, time: number): boolean {
	return seat.phase.kind === 'incoming' && !seat.phase.swung && inWindow(seat.phase.arrival, time);
}

/**
 * A local swing. `played` says whether to make the pop (your serve, or a ball in range); the host has
 * the final say. Friends send the swing to the host; the host passes it to its referee.
 */
export function seatSwing(seat: Seat, shot: { power: number; mishit: boolean; time: number }): { seat: Seat; played: boolean; send?: GuestMessage } {
	const { phase } = seat;
	const serving = phase.kind === 'serve' && phase.server === seat.me;
	if (!serving && !seatCanHit(seat, shot.time)) return { seat, played: false };
	const next = phase.kind === 'incoming' ? { ...seat, phase: { ...phase, swung: true } } : seat;
	return { seat: next, played: true, send: { t: 'swing', power: shot.power, mishit: shot.mishit } };
}

/** What the scoreboard says right now. */
export function seatStatus(seat: Seat, swingNow: boolean): string {
	const { phase } = seat;
	const partner = seat.players.find(player => player.team === myTeam(seat) && player.id !== seat.me);
	switch (phase.kind) {
		case 'waiting': return 'Get ready';
		case 'serve':
			if (phase.server === seat.me) return 'Your serve. Swing!';
			return `${nameOf(seat, phase.server)} serves${phase.server === partner?.id ? ' for your team' : ''}`;
		case 'away':
			if (phase.by === seat.me) return seat.count === 1 ? 'Served' : `Nice! Rally ${seat.count}`;
			if (phase.by !== partner?.id) return `Rally ${seat.count}`;
			return seat.count === 1 ? `${nameOf(seat, phase.by)} served` : `${nameOf(seat, phase.by)} got it! Rally ${seat.count}`;
		case 'incoming': return swingNow ? 'Swing!' : phase.swung ? 'Swung!' : `Coming at your team · Rally ${seat.count}`;
		case 'point':
			if (phase.won) return phase.why === 'out' ? 'Your team’s point. Their shot went out' : 'Your team’s point. They missed';
			return phase.why === 'out' ? 'Out! Your team caught the edge' : 'Your team missed it';
	}
}

export function seatScore(seat: Seat): string {
	const team = myTeam(seat);
	const best = seat.best > 1 ? `  ·  Best rally ${seat.best}` : '';
	return `Your team ${seat.score[team]} · ${seat.score[team === 0 ? 1 : 0]} Them${best}`;
}

// Parsing: anything malformed from another phone is dropped.

function record(text: string): Record<string, unknown> | undefined {
	let value: unknown;
	try { value = JSON.parse(text); } catch { return undefined; }
	return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
const isNum = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isTeam = (value: unknown): value is Team => value === 0 || value === 1;
const isScore = (value: unknown): value is Score => Array.isArray(value) && value.length === 2 && value.every(isNum);
const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 64;

export function parseHostMessage(text: string): HostMessage | undefined {
	const m = record(text);
	if (!m) return undefined;
	switch (m.t) {
		case 'roster': {
			if (!isNum(m.v) || !isId(m.you) || !Array.isArray(m.players) || m.players.length > 4) return undefined;
			const players: Player[] = [];
			for (const raw of m.players) {
				const p = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
				if (!isId(p.id) || typeof p.name !== 'string' || !isTeam(p.team)) return undefined;
				players.push({ id: p.id, name: p.name.slice(0, 40), team: p.team });
			}
			return { t: 'roster', v: m.v, you: m.you, players };
		}
		case 'serve': return isId(m.server) && isScore(m.score) ? { t: 'serve', server: m.server, score: [m.score[0], m.score[1]] } : undefined;
		case 'ball': return isNum(m.n) && isNum(m.flight) && isTeam(m.to) && isId(m.by) ? { t: 'ball', n: m.n, flight: m.flight, to: m.to, by: m.by } : undefined;
		case 'point':
			return isTeam(m.winner) && (m.why === 'miss' || m.why === 'out') && isScore(m.score) && isNum(m.best)
				? { t: 'point', winner: m.winner, why: m.why, score: [m.score[0], m.score[1]], best: m.best } : undefined;
		case 'ping': case 'pong': return isNum(m.at) ? { t: m.t, at: m.at } : undefined;
		default: return undefined;
	}
}

export function parseGuestMessage(text: string): GuestMessage | undefined {
	const m = record(text);
	if (!m) return undefined;
	switch (m.t) {
		case 'hello': return isNum(m.v) && typeof m.name === 'string' ? { t: 'hello', v: m.v, name: m.name.slice(0, 40) } : undefined;
		case 'swing': return isNum(m.power) && typeof m.mishit === 'boolean' ? { t: 'swing', power: clamp(m.power, 0, 1), mishit: m.mishit } : undefined;
		case 'ping': case 'pong': return isNum(m.at) ? { t: m.t, at: m.at } : undefined;
		default: return undefined;
	}
}

