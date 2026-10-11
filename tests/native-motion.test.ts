import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SwingDetector } from '../src/motion.ts';
import { normalizeMotion } from '../src/normalizeMotion.ts';
import type { DeviceMotionMeasurement } from 'expo-sensors';

function nativeMeasurement(time: number, rotation: number): DeviceMotionMeasurement {
	return {
		acceleration: { x: 0, y: 0, z: 0, timestamp: time / 1000 },
		accelerationIncludingGravity: { x: 0, y: -9.81, z: 0, timestamp: time / 1000 },
		rotationRate: { alpha: rotation * 0.6, beta: rotation * 0.8, gamma: 0, timestamp: time / 1000 },
		rotation: { alpha: 0, beta: 0, gamma: 0, timestamp: time / 1000 },
		interval: 10, orientation: 0,
	};
}

test('Expo native gyro readings drive a hit through normalization', () => {
	const detector = new SwingDetector();
	const hits = [];
	for (let time = 0; time < 700; time += 10) {
		const rotation = time < 240 ? Math.sin(Math.PI * time / 240) * 900 : 0;
		const result = detector.feed(normalizeMotion(nativeMeasurement(time, rotation), time, 'native'));
		if (result.shot) hits.push(result.shot);
	}
	assert.equal(hits.length, 1);
	assert.ok(hits[0].power > 0.3 && hits[0].power < 0.7);
});

test('a missing fused acceleration still lets the gyro drive hits', () => {
	const detector = new SwingDetector();
	let hits = 0;
	for (let time = 0; time < 700; time += 10) {
		const measurement = nativeMeasurement(time, time < 240 ? Math.sin(Math.PI * time / 240) * 600 : 0);
		measurement.acceleration = null;
		if (detector.feed(normalizeMotion(measurement, time, 'native')).shot) hits++;
	}
	assert.equal(hits, 1);
});
