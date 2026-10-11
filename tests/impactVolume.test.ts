import { test } from 'node:test';
import assert from 'node:assert/strict';
import { impactVolume } from '../src/impactVolume.ts';

test('gentle, medium and fast swings have a clearly separated volume range', () => {
	const gentle = impactVolume(0.1);
	const medium = impactVolume(0.5);
	const fast = impactVolume(1);
	assert.ok(gentle > 0.25 && gentle < 0.35, 'soft dinks stay audible');
	assert.ok(medium > gentle && medium < 0.7);
	assert.equal(fast, 1);
	assert.ok(20 * Math.log10(fast / gentle) > 9);
});

test('extreme or invalid strengths cannot produce gain above full volume', () => {
	assert.equal(impactVolume(-5), 0.28);
	assert.equal(impactVolume(5), 1);
	assert.equal(impactVolume(NaN), 0.28);
	assert.equal(impactVolume(Infinity), 0.28);
});
