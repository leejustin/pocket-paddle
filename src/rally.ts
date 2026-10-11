import type { Shot } from './motion';

/**
 * Two-phone rally rules. Pure: the caller feeds in time, swings and messages,
 * then carries out the returned effects. Each ball has exactly one judge, the
 * phone it's flying toward, so the two phones never disagree about a point.
 */
export const PROTOCOL = 1;
/** How early and late (ms) a swing still meets the ball around its arrival. */
export const EARLY = 450;
export const LATE = 250;
/** The ball bounces this long (ms) before it reaches the paddle: the cue to swing. */
export const BOUNCE_LEAD = 380;
export const POINT_PAUSE = 1800;
const MAX_LATENCY = 150;

export type EndReason = 'miss' | 'out';
export type Message =
	| { t: 'hello'; v: number; name: string }
	| { t: 'hit'; n: number; flight: number }
	/** The sender lost the point. */
	| { t: 'end'; why: EndReason }
	| { t: 'ping'; at: number }
	| { t: 'pong'; at: number };

export type Phase =
	| { kind: 'serve'; mine: boolean }
	| { kind: 'away'; launched: number; flight: number }
	| { kind: 'incoming'; launched: number; arrival: number; bounced: boolean }
	| { kind: 'point'; won: boolean; why: EndReason; until: number };

/** `count` is the number of shots in the current rally; `latency` is the one-way delay estimate (ms). */
export type Rally = { phase: Phase; count: number; me: number; them: number; best: number; latency: number };
export type Effect =
	| { kind: 'send'; message: Message }
	| { kind: 'sound'; name: 'bounce' | 'dead-ball' }
	| { kind: 'point'; won: boolean };
type Step = { rally: Rally; effects: Effect[] };

export function newRally(serveFirst: boolean): Rally {
	return { phase: { kind: 'serve', mine: serveFirst }, count: 0, me: 0, them: 0, best: 0, latency: 0 };
}

/** Harder shots fly faster. */
export function flightFor(power: number): number {
	return Math.round(1500 - 650 * clamp(power, 0, 1));
}

/** True while a swing would meet the incoming ball. */
export function canHit(rally: Rally, time: number): boolean {
	const { phase } = rally;
	return phase.kind === 'incoming' && time >= phase.arrival - EARLY && time <= phase.arrival + LATE;
}

/**
 * A local swing. `played` says whether it met the ball (pop or edge clack);
 * swinging at thin air stays silent, like a real paddle.
 */
export function swing(rally: Rally, shot: Shot, now: number): Step & { played: boolean } {
	const { phase } = rally;
	const serving = phase.kind === 'serve' && phase.mine;
	if (!serving && !canHit(rally, shot.time)) return { rally, effects: [], played: false };
	// Catching the edge sends the ball out.
	if (shot.mishit) return { ...lose(rally, 'out', now), played: true };
	const count = serving ? 1 : rally.count + 1;
	const flight = flightFor(shot.power);
	return {
		rally: { ...rally, count, phase: { kind: 'away', launched: now, flight } },
		effects: [{ kind: 'send', message: { t: 'hit', n: count, flight } }],
		played: true,
	};
}

export function receive(rally: Rally, message: Message, now: number): Step {
	switch (message.t) {
		case 'hit': {
			const flight = clamp(message.flight, 300, 3000);
			return { rally: { ...rally, count: message.n, phase: { kind: 'incoming', launched: now, arrival: now + flight - rally.latency, bounced: false } }, effects: [] };
		}
		case 'end': {
			const best = Math.max(rally.best, rally.count);
			return {
				rally: { ...rally, me: rally.me + 1, best, phase: { kind: 'point', won: true, why: message.why, until: now + POINT_PAUSE } },
				effects: [{ kind: 'point', won: true }],
			};
		}
		case 'ping':
			return { rally, effects: [{ kind: 'send', message: { t: 'pong', at: message.at } }] };
		case 'pong': {
			const oneWay = clamp((now - message.at) / 2, 0, MAX_LATENCY);
			const latency = rally.latency === 0 ? oneWay : rally.latency * 0.7 + oneWay * 0.3;
			return { rally: { ...rally, latency }, effects: [] };
		}
		default:
			return { rally, effects: [] };
	}
}

/** Advances time: the bounce cue, a ball that got past you, and the pause after a point. */
export function tick(rally: Rally, now: number): Step {
	const { phase } = rally;
	if (phase.kind === 'incoming') {
		if (now > phase.arrival + LATE) {
			const lost = lose(rally, 'miss', now);
			return { rally: lost.rally, effects: [{ kind: 'sound', name: 'dead-ball' }, ...lost.effects] };
		}
		if (!phase.bounced && now >= phase.arrival - BOUNCE_LEAD) {
			return { rally: { ...rally, phase: { ...phase, bounced: true } }, effects: [{ kind: 'sound', name: 'bounce' }] };
		}
	}
	if (phase.kind === 'point' && now >= phase.until) {
		// The winner of the point serves next.
		return { rally: { ...rally, count: 0, phase: { kind: 'serve', mine: phase.won } }, effects: [] };
	}
	return { rally, effects: [] };
}

function lose(rally: Rally, why: EndReason, now: number): Step {
	return {
		rally: { ...rally, them: rally.them + 1, best: Math.max(rally.best, rally.count), phase: { kind: 'point', won: false, why, until: now + POINT_PAUSE } },
		effects: [{ kind: 'send', message: { t: 'end', why } }, { kind: 'point', won: false }],
	};
}

/** Parses one line from the other phone; anything malformed is dropped. */
export function parseMessage(text: string): Message | undefined {
	let value: unknown;
	try { value = JSON.parse(text); } catch { return undefined; }
	if (!value || typeof value !== 'object') return undefined;
	const m = value as Record<string, unknown>;
	const num = (key: string) => typeof m[key] === 'number' && Number.isFinite(m[key]);
	switch (m.t) {
		case 'hello': return num('v') && typeof m.name === 'string' ? { t: 'hello', v: m.v as number, name: m.name.slice(0, 40) } : undefined;
		case 'hit': return num('n') && num('flight') ? { t: 'hit', n: m.n as number, flight: m.flight as number } : undefined;
		case 'end': return m.why === 'miss' || m.why === 'out' ? { t: 'end', why: m.why } : undefined;
		case 'ping': case 'pong': return num('at') ? { t: m.t, at: m.at as number } : undefined;
		default: return undefined;
	}
}

function clamp(value: number, min: number, max: number) {
	return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
}
