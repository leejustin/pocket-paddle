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

type Swing = { start: number; peak: number; active: number; turn: Vector; turned: number };

/**
 * Frame-rate-independent swing detector. Fires on the first sample after the
 * swing-speed peak — the moment a real paddle would meet the ball — rather than
 * waiting for the whole gesture to finish.
 */
export class SwingDetector {
	private lastTime: number | undefined;
	private gravity: Vector | undefined;
	private drive = 0;
	private glow = 0;
	private noise = 40;
	private swing: Swing | undefined;
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
		this.swing = undefined;
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
		const scale = 1.35 - this.sensitivity * 0.7;
		const start = Math.max(START * scale, this.noise * 3.5);
		const hit = Math.max(HIT * scale, start * 1.5);

		if (!this.armed) {
			// Follow-through and the recovery swing must settle before the next shot.
			const settled = this.drive < Math.max(start, this.lastPeak * 0.4);
			if (settled && sample.time - this.lastHit >= 160) this.armed = true;
			else return { swing: this.glow };
		}
		if (!this.swing) {
			if (this.drive < start) return { swing: this.glow };
			this.swing = { start: sample.time, peak: this.drive, active: 0, turn: { x: 0, y: 0, z: 0 }, turned: 0 };
		}
		const swing = this.swing;
		// Count real sensor frames above threshold; one glitchy frame is not a swing.
		if (raw >= start) swing.active++;
		// Integrate rotation to learn how steady the swing's axis was.
		swing.turn = { x: swing.turn.x + rotationRate.x * dt, y: swing.turn.y + rotationRate.y * dt, z: swing.turn.z + rotationRate.z * dt };
		swing.turned += rotation * dt;
		swing.peak = Math.max(swing.peak, this.drive);
		const duration = sample.time - swing.start;
		// A quick return right after a hit needs a deliberate swing, not a recoil.
		const recovering = sample.time - this.lastHit < 450;
		const required = recovering ? Math.max(hit * 1.4, this.lastPeak * 0.7) : hit;
		if (swing.peak >= required && swing.active >= 2 && this.drive < swing.peak * 0.88) {
			const shot = makeShot(swing.peak, sample.time, wobbled(swing));
			this.lastHit = sample.time;
			this.lastPeak = swing.peak;
			this.armed = false;
			this.swing = undefined;
			return { swing: this.glow, shot };
		}
		// Slow turns (looking at the screen, setting the phone down) never get a pop.
		if (this.drive < start * 0.7 || duration > 550) this.swing = undefined;
		return { swing: this.glow };
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
function wobbled(swing: Swing) {
	// Straight pushes barely rotate, so they have no meaningful axis to judge.
	return swing.turned > 20 && magnitude(swing.turn) / swing.turned < MISHIT_COHERENCE;
}

function magnitude(v: Vector) { return Math.hypot(v.x, v.y, v.z); }
function subtract(a: Vector, b: Vector): Vector { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function clamp(value: number, low: number, high: number) { return Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : low; }
function validVector(v: Vector) { return [v.x, v.y, v.z].every(n => Number.isFinite(n) && Math.abs(n) <= 5000); }
