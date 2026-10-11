import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, parseSettings } from '../src/settingsParse.ts';

test('saved settings round-trip', () => {
	const saved = { finish: 'Coral', sensitivity: 2, pack: 'wood' as const, photo: 'paddle-photo-1760000000000.jpg' };
	assert.deepEqual(parseSettings(JSON.stringify(saved)), saved);
});

test('missing, corrupt or old saves fall back to defaults field by field', () => {
	assert.deepEqual(parseSettings(null), DEFAULTS);
	assert.deepEqual(parseSettings('{not json'), DEFAULTS);
	assert.deepEqual(parseSettings('[1,2]'), DEFAULTS);
	const old = parseSettings(JSON.stringify({ finish: 'Coral', sensitivity: 9, whoosh: 'yes', mode: 'rally', bestMph: 40 }));
	assert.deepEqual(old, { finish: 'Coral', sensitivity: DEFAULTS.sensitivity, pack: 'classic' });
});

test('unknown sound packs and photo paths outside the app are ignored', () => {
	const odd = parseSettings(JSON.stringify({ pack: 'kazoo', photo: '../../etc/passwd' }));
	assert.equal(odd.pack, 'classic');
	assert.equal(odd.photo, undefined);
});
