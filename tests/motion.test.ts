import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SwingDetector } from '../src/motion.ts';
import type { MotionSample, Shot, Vector } from '../src/motion.ts';

const ZERO = { x: 0, y: 0, z: 0 };
const GRAVITY = { x: 0, y: 9.81, z: 0 };

function sample(time: number, acceleration: Vector = ZERO, rotation = 0): MotionSample {
	return { time, acceleration, includingGravity: {
		x: acceleration.x + GRAVITY.x, y: acceleration.y + GRAVITY.y, z: acceleration.z + GRAVITY.z,
	}, rotationRate: { x: 0, y: 0, z: rotation } };
}

/** A smooth swing: angular speed rises to `rotation` deg/s at mid-swing, then falls. */
function swing(detector: SwingDetector, rotation: number, options: { accel?: number; start?: number; step?: number; length?: number } = {}) {
	const { accel = 0, start = 0, step = 10, length = 240 } = options;
	const shots: Shot[] = [];
	const swings: number[] = [];
	for (let offset = 0; offset <= length + 400; offset += step) {
		const shape = offset < length ? Math.sin(Math.PI * offset / length) : 0;
		const result = detector.feed(sample(start + offset, { x: accel * shape, y: 0, z: 0 }, rotation * shape));
		swings.push(result.swing);
		if (result.shot) shots.push(result.shot);
	}
	return { shots, swings };
}

test('the first swing pops immediately, with no calibration step', () => {
	assert.equal(swing(new SwingDetector(), 450).shots.length, 1);
});

test('the pop lands right after peak paddle speed, not when the gesture ends', () => {
	const { shots } = swing(new SwingDetector(), 900, { start: 1000 });
	assert.equal(shots.length, 1);
	const peakAt = 1000 + 120;
	assert.ok(shots[0].time > peakAt && shots[0].time <= peakAt + 50, `hit at ${shots[0].time}`);
});

test('gentle flicks pop softly and big swings pop at full strength', () => {
	assert.ok(swing(new SwingDetector(), 380).shots[0].power < 0.3);
	assert.equal(swing(new SwingDetector(), 1800).shots[0].power, 1);
});

test('faster swings produce progressively stronger pops', () => {
	const powers = [350, 600, 900, 1300].map(rotation => swing(new SwingDetector(), rotation).shots[0].power);
	for (let i = 1; i < powers.length; i++) assert.ok(powers[i] > powers[i - 1]);
});

test('straight pushes without wrist rotation still scale with acceleration', () => {
	const powers = [12, 22, 40].map(accel => {
		const { shots } = swing(new SwingDetector(), 0, { accel });
		assert.equal(shots.length, 1, `push ${accel}`);
		assert.equal(shots[0].mishit, false, 'a push has no axis to wobble');
		return shots[0].power;
	});
	assert.ok(powers[0] < powers[1] && powers[1] < powers[2]);
});

test('pops are consistent at 30, 60, 100 and 120 Hz', () => {
	for (const step of [1000 / 30, 1000 / 60, 10, 1000 / 120]) {
		const gentle = swing(new SwingDetector(), 380, { step }).shots;
		const hard = swing(new SwingDetector(), 1150, { step }).shots;
		assert.equal(gentle.length, 1, `gentle at ${step.toFixed(1)}ms`);
		assert.equal(hard.length, 1, `hard at ${step.toFixed(1)}ms`);
		assert.ok(gentle[0].power < 0.3 && hard[0].power > 0.55, `strength at ${step.toFixed(1)}ms`);
	}
});

test('handling, walking and slow turns never pop', () => {
	const detector = new SwingDetector();
	for (let time = 0; time < 5000; time += 10) {
		const accel = { x: Math.sin(time / 90) * 1.5, y: Math.sin(time / 60) * 2.5, z: 0.6 };
		assert.equal(detector.feed(sample(time, accel, 60 + 40 * Math.sin(time / 120))).shot, undefined);
	}
	// Turning the phone over to look at it: moderate rotation held for most of a second.
	for (let time = 5000; time < 6000; time += 10) {
		assert.equal(detector.feed(sample(time, ZERO, time < 5800 ? 240 : 0)).shot, undefined);
	}
});

test('one glitchy sensor frame does not pop', () => {
	const detector = new SwingDetector();
	assert.equal(detector.feed(sample(0, ZERO, 2500)).shot, undefined);
	for (let time = 10; time < 600; time += 10) assert.equal(detector.feed(sample(time)).shot, undefined);
});

test('follow-through and the recovery swing make only one pop', () => {
	const detector = new SwingDetector();
	let hits = 0;
	for (let time = 0; time < 700; time += 10) {
		const forward = time < 240 ? Math.sin(Math.PI * time / 240) * 1100 : 0;
		const back = time >= 240 && time < 480 ? Math.sin(Math.PI * (time - 240) / 240) * 650 : 0;
		if (detector.feed(sample(time, ZERO, forward + back)).shot) hits++;
	}
	assert.equal(hits, 1);
	assert.equal(swing(detector, 450, { start: 1000 }).shots.length, 1, 'the next real swing still counts');
});

test('a quick series of separate swings all pop', () => {
	const detector = new SwingDetector();
	let hits = 0;
	for (let i = 0; i < 5; i++) hits += swing(detector, 700, { start: i * 700 }).shots.length;
	assert.equal(hits, 5);
});

test('the swing glow follows the swing and settles afterwards', () => {
	const { swings } = swing(new SwingDetector(), 1100);
	assert.ok(Math.max(...swings) > 0.6);
	assert.ok(swings[swings.length - 1] < 0.05);
	assert.ok(swings[0] < 0.1);
});

test('higher sensitivity catches smaller flicks', () => {
	const calm = new SwingDetector();
	calm.setSensitivity(0);
	assert.equal(swing(calm, 340).shots.length, 0);
	const keen = new SwingDetector();
	keen.setSensitivity(1);
	assert.equal(swing(keen, 340).shots.length, 1);
});

test('bad sensor numbers and out-of-order frames do not poison the detector', () => {
	const detector = new SwingDetector();
	detector.feed(sample(0));
	detector.feed(sample(10, { x: NaN, y: 0, z: 0 }));
	detector.feed(sample(5));
	detector.feed(sample(Infinity));
	assert.equal(swing(detector, 600, { start: 20 }).shots.length, 1);
});

test('a long sensor gap cannot cause a ghost pop', () => {
	const detector = new SwingDetector();
	for (let time = 0; time < 100; time += 10) detector.feed(sample(time, ZERO, 900));
	assert.equal(detector.feed(sample(2000)).shot, undefined);
	assert.equal(detector.feed(sample(2010)).shot, undefined);
});

test('gravity-only sensors still detect a strong straight swing', () => {
	const detector = new SwingDetector();
	let hits = 0;
	for (let time = 0; time < 300; time += 10) {
		const value = sample(time); value.acceleration = undefined; detector.feed(value);
	}
	for (let offset = 0; offset < 600; offset += 10) {
		const push = offset < 240 ? 25 * Math.sin(Math.PI * offset / 240) : 0;
		const value = sample(300 + offset, { x: push, y: 0, z: 0 });
		value.acceleration = undefined;
		if (detector.feed(value).shot) hits++;
	}
	assert.equal(hits, 1);
});

/** A swing about a changing rotation axis. */
function axisSwing(axis: (t: number) => Vector) {
	const detector = new SwingDetector();
	const shots: Shot[] = [];
	for (let t = 0; t <= 640; t += 10) {
		const shape = t < 240 ? Math.sin(Math.PI * t / 240) * 900 : 0;
		const a = axis(t);
		const result = detector.feed({ time: t, acceleration: ZERO, includingGravity: GRAVITY,
			rotationRate: { x: a.x * shape, y: a.y * shape, z: a.z * shape } });
		if (result.shot) shots.push(result.shot);
	}
	return shots;
}

test('a clean swing hits the sweet spot; a wobbly one catches the edge', () => {
	assert.equal(axisSwing(() => ({ x: 0, y: 1, z: 0 }))[0].mishit, false);
	const wobbly = axisSwing(t => ({ x: Math.cos(t / 30), y: Math.sin(t / 30), z: 0 }));
	assert.equal(wobbly.length, 1);
	assert.equal(wobbly[0].mishit, true);
});
