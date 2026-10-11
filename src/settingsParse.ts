import { PACKS } from './soundMix.ts';
import type { Pack } from './soundMix';

/** Preferences only: no scores and no motion data are ever stored. `photo` is a file name in the app's documents. */
export type Settings = { finish: string; sensitivity: number; pack: Pack; photo?: string };
export const DEFAULTS: Settings = { finish: 'Volt', sensitivity: 1, pack: 'classic' };
export const KEY = 'pocket-pickle/settings/v1';

/** Keeps only known keys with the right types, so a bad or old save can't break the app. */
export function parseSettings(raw: string | null): Settings {
	if (!raw) return DEFAULTS;
	let value: unknown;
	try { value = JSON.parse(raw); } catch { return DEFAULTS; }
	if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULTS;
	const saved = value as Record<string, unknown>;
	const settings: Settings = {
		finish: typeof saved.finish === 'string' && saved.finish.length < 40 ? saved.finish : DEFAULTS.finish,
		sensitivity: saved.sensitivity === 0 || saved.sensitivity === 1 || saved.sensitivity === 2 ? saved.sensitivity : DEFAULTS.sensitivity,
		pack: PACKS.find(pack => pack.id === saved.pack)?.id ?? DEFAULTS.pack,
	};
	if (typeof saved.photo === 'string' && /^paddle-photo-\d+\.[a-z0-9]{1,5}$/i.test(saved.photo)) settings.photo = saved.photo;
	return settings;
}
