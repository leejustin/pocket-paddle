export type Vector = { x: number; y: number; z: number };
export type MotionSample = {
	time: number;
	acceleration?: Vector;
	includingGravity: Vector;
	rotationRate?: Vector;
	gravitySign?: 1 | -1;
};
/** `power` (0..1) picks the pop's loudness and brightness; `mishit` swaps in an edge clack. */
export type Shot = { power: number; time: number; mishit: boolean };
/** `swing` is a smoothed 0..1 swing intensity for the paddle's edge glow. */
export type MotionResult = { swing: number; shot?: Shot };

// A phone swing is mostly wrist and forearm rotation, so the gyro is the primary
// signal (deg/s). Linear acceleration (m/s²) covers straight pushes and is
// converted into the same units.
const ACCEL_TO_ROTATION = 32;
const START = 170;
const HIT = 300;
const FULL_POWER = 1500;
const FULL_GLOW = 1100;
// Below this axis coherence the paddle face wobbled through contact: an edge hit.
const MISHIT_COHERENCE = 0.6;
// Nobody hits two balls closer together than this (ms), so anything sooner is the same stroke.
const MIN_GAP = 500;
// A possible wind-up waits this long (ms) after the phone stops at the top for the real swing
// to come back the other way, and never longer than MAX_HOLD after its peak.
const HOLD = 180;
const MAX_HOLD = 700;
// How quickly earlier rotation fades from memory when judging what came before a swing (s).
const RECENT_TAU = 0.35;

/**
 * One continuous burst of paddle motion. `before` is how the phone had been
 * turning just before it started, to tell a wind-up from the swing that follows.
 */
type Stroke = { start: number; peak: number; peakTime: number; active: number; turn: Vector; turned: number; before: Vector };

/**
 * Frame-rate-independent swing detector. Fires on the first sample after the
 * swing-speed peak — the moment a real paddle would meet the ball — rather than
 * waiting for the whole gesture to finish.
 *
 * A real stroke is a backswing followed by a faster swing the other way, and
 * only the second one meets the ball. A swing that follows rotation the other
 * way fires at once. A fast swing out of nowhere might be a wind-up, so it waits
 * briefly: if a stronger swing comes back the other way, that one is the hit.
 */
export class SwingDetector {
	private lastTime: number | undefined;
	private gravity: Vector | undefined;
	private drive = 0;
	private glow = 0;
	private noise = 40;
	private recent: Vector = { x: 0, y: 0, z: 0 };
	private stroke: Stroke | undefined;
	private pending: Stroke | undefined;
	private pendingStill: number | undefined;
	private lastHit = -Infinity;
	private lastPeak = 0;
	private armed = true;
	private sensitivity = 0.5;

	setSensitivity(value: number) {
		this.sensitivity = clamp(value, 0, 1);
	}

	reset() {
		this.lastTime = undefined;
		this.gravity = undefined;
		this.drive = 0;
		this.glow = 0;
		this.noise = 40;
		this.recent = { x: 0, y: 0, z: 0 };
		this.stroke = undefined;
		this.pending = undefined;
		this.pendingStill = undefined;
		this.lastHit = -Infinity;
		this.lastPeak = 0;
		this.armed = true;
	}

	feed(sample: MotionSample): MotionResult {
		if (!validVector(sample.includingGravity) || !Number.isFinite(sample.time) ||
			(sample.acceleration && !validVector(sample.acceleration)) ||
			(sample.rotationRate && !validVector(sample.rotationRate))) {
			return { swing: this.glow };
		}
		if (this.lastTime !== undefined && sample.time <= this.lastTime) return { swing: this.glow };
		// After a sensor gap, start fresh rather than treating stale state as a swing.
		if (this.lastTime !== undefined && sample.time - this.lastTime > 250) this.reset();
		const first = this.lastTime === undefined;
		const dt = first ? 0.016 : Math.min(0.05, (sample.time - this.lastTime!) / 1000);
		this.lastTime = sample.time;
		const linear = magnitude(this.linearAcceleration(sample, dt));
		const rotationRate = sample.rotationRate ?? { x: 0, y: 0, z: 0 };
		const rotation = magnitude(rotationRate);
		const raw = Math.max(rotation, linear * ACCEL_TO_ROTATION);
		// A very short time constant removes sensor chatter without delaying the peak.
		this.drive = first ? raw : this.drive + (raw - this.drive) * (1 - Math.exp(-dt / 0.012));
		const target = clamp((this.drive - START * 0.6) / (FULL_GLOW - START * 0.6), 0, 1);
		// The glow rises fast and releases more slowly, trailing the paddle.
		const tau = target > this.glow ? 0.02 : 0.09;
		this.glow += (target - this.glow) * (1 - Math.exp(-dt / tau));
		if (raw < START * 0.5) this.noise += (raw - this.noise) * 0.02;
		// Remember which way the phone has been turning lately, fading over a few hundred ms.
		const fade = Math.exp(-dt / RECENT_TAU);
		this.recent = { x: this.recent.x * fade + rotationRate.x * dt, y: this.recent.y * fade + rotationRate.y * dt, z: this.recent.z * fade + rotationRate.z * dt };
		const scale = 1.35 - this.sensitivity * 0.7;
		const start = Math.max(START * scale, this.noise * 3.5);
		const hit = Math.max(HIT * scale, start * 1.5);

		let shot: Shot | undefined;
		// A possible wind-up that nothing answered was the hit after all.
		if (this.pending && !this.stroke) {
			if (this.drive >= start * 0.4) this.pendingStill = undefined;
			else this.pendingStill ??= sample.time;
			const waited = this.pendingStill !== undefined && sample.time - this.pendingStill > HOLD;
			if (waited || sample.time - this.pending.peakTime > MAX_HOLD) shot = this.release();
		}
		if (!this.armed) {
			// The next stroke starts once this one slows right down: the turnaround at the top of a
			// wind-up, or the end of a follow-through. MIN_GAP keeps a follow-through from popping again.
			if (this.drive < Math.max(start, this.lastPeak * 0.4)) this.armed = true;
			else return { swing: this.glow, shot };
		}
		if (!this.stroke) {
			if (this.drive < start) return { swing: this.glow, shot };
			this.stroke = { start: sample.time, peak: this.drive, peakTime: sample.time, active: 0, turn: { x: 0, y: 0, z: 0 }, turned: 0, before: { ...this.recent } };
		}
		const stroke = this.stroke;
		// Count real sensor frames above threshold; one glitchy frame is not a swing.
		if (raw >= start) stroke.active++;
		// Integrate rotation to learn the stroke's direction and how steady its axis was.
		stroke.turn = { x: stroke.turn.x + rotationRate.x * dt, y: stroke.turn.y + rotationRate.y * dt, z: stroke.turn.z + rotationRate.z * dt };
		stroke.turned += rotation * dt;
		if (this.drive > stroke.peak) { stroke.peak = this.drive; stroke.peakTime = sample.time; }
		const duration = sample.time - stroke.start;
		// A stroke has to speed up first; the fading end of the last one never counts.
		const rose = stroke.peakTime > stroke.start;
		if (rose && stroke.peak >= hit && stroke.active >= 2 && this.drive < stroke.peak * 0.88) {
			this.stroke = undefined;
			this.armed = false;
			this.lastPeak = stroke.peak;
			return { swing: this.glow, shot: this.decide(stroke) ?? shot };
		}
		// Slow turns (looking at the screen, setting the phone down) never get a pop.
		if (this.drive < start * 0.7 || duration > 550) {
			this.stroke = undefined;
			// A weak return the other way after a possible wind-up means the wind-up was the hit.
			// (The fading tail of the same stroke doesn't count.)
			if (this.pending && opposite(this.pending.turn, stroke.turn)) shot = this.release() ?? shot;
		}
		return { swing: this.glow, shot };
	}

	/** A stroke just passed its peak hard enough to be a hit. Returns the shot to play now, if any. */
	private decide(stroke: Stroke): Shot | undefined {
		const pending = this.pending;
		if (pending) {
			this.pending = undefined;
			// The wind-up came first; the stronger swing back the other way is what meets the ball.
			if (opposite(pending.turn, stroke.turn) && stroke.peak >= pending.peak * 0.9) return this.fire(stroke);
			// Otherwise the earlier stroke was the hit, and this is its recovery or follow-through.
			return this.fire(pending);
		}
		// Following a backswing, this is the real swing. Out of nowhere, it might be a wind-up, so wait.
		if (hasAxis(stroke) && !opposite(stroke.before, stroke.turn, 6)) {
			this.pending = stroke;
			this.pendingStill = undefined;
			return undefined;
		}
		return this.fire(stroke);
	}

	private release() {
		const pending = this.pending;
		this.pending = undefined;
		return pending && this.fire(pending);
	}

	/** The shot happened at the stroke's peak, even when it's decided a moment later. */
	private fire(stroke: Stroke): Shot | undefined {
		if (stroke.peakTime - this.lastHit < MIN_GAP) return undefined;
		this.lastHit = stroke.peakTime;
		return makeShot(stroke.peak, stroke.peakTime, wobbled(stroke));
	}

	private linearAcceleration(sample: MotionSample, dt: number): Vector {
		if (sample.acceleration) return sample.acceleration;
		this.gravity ??= { ...sample.includingGravity };
		const blend = 1 - Math.exp(-dt / 0.4);
		this.gravity = {
			x: this.gravity.x + (sample.includingGravity.x - this.gravity.x) * blend,
			y: this.gravity.y + (sample.includingGravity.y - this.gravity.y) * blend,
			z: this.gravity.z + (sample.includingGravity.z - this.gravity.z) * blend,
		};
		return subtract(sample.includingGravity, this.gravity);
	}
}

export function makeShot(peak: number, time: number, mishit = false): Shot {
	return { power: clamp((peak - HIT * 0.65) / (FULL_POWER - HIT * 0.65), 0.05, 1), time, mishit };
}

/** A swing whose rotation axis wandered through contact catches the edge guard. */
function wobbled(stroke: Stroke) {
	// Straight pushes barely rotate, so they have no meaningful axis to judge.
	return stroke.turned > 20 && magnitude(stroke.turn) / stroke.turned < MISHIT_COHERENCE;
}

/** Straight pushes barely rotate, so they have no direction to compare. */
function hasAxis(stroke: Stroke) {
	return stroke.turned > 20 && magnitude(stroke.turn) > 15;
}

/** True when two rotations (degrees turned) clearly go opposite ways; `min` ignores tiny ones. */
function opposite(a: Vector, b: Vector, min = 15) {
	const lengths = magnitude(a) * magnitude(b);
	if (magnitude(a) < min || magnitude(b) < min) return false;
	return (a.x * b.x + a.y * b.y + a.z * b.z) / lengths < -0.3;
}

function magnitude(v: Vector) { return Math.hypot(v.x, v.y, v.z); }
function subtract(a: Vector, b: Vector): Vector { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function clamp(value: number, low: number, high: number) { return Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : low; }
function validVector(v: Vector) { return [v.x, v.y, v.z].every(n => Number.isFinite(n) && Math.abs(n) <= 5000); }
