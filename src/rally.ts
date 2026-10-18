import type { Shot } from './motion';

/**
 * Two-phone rally rules. Pure: the caller feeds in time, swings and messages,
 * then carries out the returned effects. Each ball has exactly one judge, the
 * phone it's flying toward, so the two phones never disagree about a point.
 */
export const PROTOCOL = 1;
/**
 * How early and late (ms) a swing still meets the ball around its arrival.
 * Deliberately generous: a 2.5 s window, so a rally feels fun instead of frame-perfect.
 */
export const EARLY = 1500;
export const LATE = 1000;
/** The ball bounces this long (ms) before it reaches the paddle: the cue to swing. */
export const BOUNCE_LEAD = 380;
export const POINT_PAUSE = 1800;
/** Gap (ms) to the first heartbeat buzz after the window opens; each one comes sooner, down to MIN_BEAT. */
export const FIRST_BEAT = 380;
const MIN_BEAT = 110;
export const MAX_LATENCY = 150;

export type EndReason = 'miss' | 'out';
export type Message =
	| { t: 'hello'; v: number; name: string }
	| { t: 'hit'; n: number; flight: number }
	/** The sender lost the point. */
	| { t: 'end'; why: EndReason }
	| { t: 'ping'; at: number }
	| { t: 'pong'; at: number };

/** A ball flying at this phone, with the progress of its swing cues. */
export type Incoming = { kind: 'incoming'; launched: number; arrival: number; bounced: boolean; opened: boolean; beatAt: number; gap: number };
export type Phase =
	| { kind: 'serve'; mine: boolean }
	| { kind: 'away'; launched: number; flight: number }
	| Incoming
	| { kind: 'point'; won: boolean; why: EndReason; until: number };

/** `count` is the number of shots in the current rally; `latency` is the one-way delay estimate (ms). */
export type Rally = { phase: Phase; count: number; me: number; them: number; best: number; latency: number };
/**
 * Haptic cues for the incoming ball: `coming` when it leaves the other paddle, `open` when a swing would
 * meet it, a quickening `beat` while the window is open, and `now` on the bounce.
 */
export type Buzz = 'coming' | 'open' | 'beat' | 'now';
export type Effect =
	| { kind: 'send'; message: Message }
	| { kind: 'buzz'; name: Buzz }
	| { kind: 'sound'; name: 'bounce' | 'dead-ball' }
	| { kind: 'point'; won: boolean };
type Step = { rally: Rally; effects: Effect[] };
export type Cue = Extract<Effect, { kind: 'buzz' | 'sound' }>;

/** A fresh incoming ball that lands `flight` ms after `now`. */
export function incoming(now: number, arrival: number): Incoming {
	return { kind: 'incoming', launched: now, arrival, bounced: false, opened: false, beatAt: 0, gap: FIRST_BEAT };
}

/** The swing cues due for an incoming ball at `now`: the window opening, the quickening beat, and the bounce. */
export function cues<P extends Incoming>(phase: P, now: number): { phase: P; effects: Cue[] } | undefined {
	if (!phase.opened && now >= phase.arrival - EARLY) {
		return { phase: { ...phase, opened: true, beatAt: now + phase.gap }, effects: [{ kind: 'buzz', name: 'open' }] };
	}
	if (!phase.bounced && now >= phase.arrival - BOUNCE_LEAD) {
		return { phase: { ...phase, bounced: true }, effects: [{ kind: 'sound', name: 'bounce' }, { kind: 'buzz', name: 'now' }] };
	}
	if (phase.opened && !phase.bounced && now >= phase.beatAt) {
		const gap = Math.max(MIN_BEAT, Math.round(phase.gap * 0.72));
		return { phase: { ...phase, beatAt: now + gap, gap }, effects: [{ kind: 'buzz', name: 'beat' }] };
	}
	return undefined;
}

export function newRally(serveFirst: boolean): Rally {
	return { phase: { kind: 'serve', mine: serveFirst }, count: 0, me: 0, them: 0, best: 0, latency: 0 };
}

/** Harder shots fly faster: 3.2 s for a soft one down to 2 s for a full swing. */
export function flightFor(power: number): number {
	return Math.round(3200 - 1200 * clamp(power, 0, 1));
}

/** True while a swing would meet the incoming ball. */
export function canHit(rally: Rally, time: number): boolean {
	return rally.phase.kind === 'incoming' && inWindow(rally.phase.arrival, time);
}

/** True when a swing at `time` meets a ball arriving at `arrival`. */
export function inWindow(arrival: number, time: number): boolean {
	return time >= arrival - EARLY && time <= arrival + LATE;
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
			const flight = clamp(message.flight, 300, 5000);
			return { rally: { ...rally, count: message.n, phase: incoming(now, now + flight - rally.latency) }, effects: [{ kind: 'buzz', name: 'coming' }] };
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

/** Advances time: the swing cues and bounce, a ball that got past you, and the pause after a point. */
export function tick(rally: Rally, now: number): Step {
	const { phase } = rally;
	if (phase.kind === 'incoming') {
		if (now > phase.arrival + LATE) {
			const lost = lose(rally, 'miss', now);
			return { rally: lost.rally, effects: [{ kind: 'sound', name: 'dead-ball' }, ...lost.effects] };
		}
		const due = cues(phase, now);
		if (due) return { rally: { ...rally, phase: due.phase }, effects: due.effects };
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

export function clamp(value: number, min: number, max: number) {
	return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
}
