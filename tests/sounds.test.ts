import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextVariant, tierFor } from '../src/soundMix.ts';

test('harder hits move to brighter sound tiers', () => {
	assert.equal(tierFor(0.1), 'soft');
	assert.equal(tierFor(0.5), 'medium');
	assert.equal(tierFor(0.95), 'hard');
});

test('the same variant never plays twice in a row', () => {
	for (let last = 0; last < 3; last++) {
		for (const roll of [0, 0.4, 0.99]) assert.notEqual(nextVariant(last, 3, () => roll), last);
	}
});
