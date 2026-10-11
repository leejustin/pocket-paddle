import { impactVolume } from './impactVolume.ts';

export type Tier = 'soft' | 'medium' | 'hard';
/** Each pack is a different paddle hitting the same ball. Classic is free; the rest come with Pro. */
export type Pack = 'classic' | 'wood' | 'carbon' | 'thock';
export const PACKS: { id: Pack; label: string; pro: boolean }[] = [
	{ id: 'classic', label: 'Classic', pro: false },
	{ id: 'wood', label: 'Wood', pro: true },
	{ id: 'carbon', label: 'Carbon', pro: true },
	{ id: 'thock', label: 'Thock', pro: true },
];
export type SoundName = `${Pack}/pop-${Tier}-${1 | 2 | 3}` | `clack-${1 | 2}` | `bounce-${1 | 2}` | 'dead-ball';
/** Rally sounds: the ball landing on the court before it reaches you, and a ball that got past you. */
export type Cue = 'bounce' | 'dead-ball';

export const CLACKS: SoundName[] = ['clack-1', 'clack-2'];
const BOUNCES: SoundName[] = ['bounce-1', 'bounce-2'];

export function popsFor(pack: Pack, tier: Tier): SoundName[] {
	return ([1, 2, 3] as const).map(variant => `${pack}/pop-${tier}-${variant}` as const);
}

/** Harder hits use a brighter, clickier recording, not just a louder one. */
export function tierFor(power: number): Tier {
	return power < 0.3 ? 'soft' : power < 0.7 ? 'medium' : 'hard';
}

/** Picks a variant that differs from the last one, so rallies never machine-gun. */
export function nextVariant(last: number, count: number, random = Math.random): number {
	if (count <= 1) return 0;
	if (last < 0 || last >= count) return Math.floor(random() * count);
	const pick = Math.floor(random() * (count - 1));
	return pick >= last ? pick + 1 : pick;
}

/** Remembers the last variant per group so each sound differs from the one before it. */
export function createPicker() {
	const last = new Map<string, number>();
	return (group: string, names: SoundName[]): SoundName => {
		const index = nextVariant(last.get(group) ?? -1, names.length);
		last.set(group, index);
		return names[index];
	};
}

type Pick = ReturnType<typeof createPicker>;

/** Which sound a contact makes, and how loud. */
export function hitSound(pick: Pick, power: number, mishit: boolean, pack: Pack): { name: SoundName; volume: number } {
	if (mishit) return { name: pick('clack', CLACKS), volume: impactVolume(power) * 0.85 };
	const tier = tierFor(power);
	return { name: pick(`${pack}/${tier}`, popsFor(pack, tier)), volume: impactVolume(power) };
}

export function cueSound(pick: Pick, cue: Cue): { name: SoundName; volume: number } {
	return cue === 'bounce' ? { name: pick('bounce', BOUNCES), volume: 0.55 } : { name: 'dead-ball', volume: 0.6 };
}
