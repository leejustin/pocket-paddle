import classicSoft1 from '../assets/sounds/pop-soft-1.wav';
import classicSoft2 from '../assets/sounds/pop-soft-2.wav';
import classicSoft3 from '../assets/sounds/pop-soft-3.wav';
import classicMedium1 from '../assets/sounds/pop-medium-1.wav';
import classicMedium2 from '../assets/sounds/pop-medium-2.wav';
import classicMedium3 from '../assets/sounds/pop-medium-3.wav';
import classicHard1 from '../assets/sounds/pop-hard-1.wav';
import classicHard2 from '../assets/sounds/pop-hard-2.wav';
import classicHard3 from '../assets/sounds/pop-hard-3.wav';
import woodSoft1 from '../assets/sounds/wood/pop-soft-1.wav';
import woodSoft2 from '../assets/sounds/wood/pop-soft-2.wav';
import woodSoft3 from '../assets/sounds/wood/pop-soft-3.wav';
import woodMedium1 from '../assets/sounds/wood/pop-medium-1.wav';
import woodMedium2 from '../assets/sounds/wood/pop-medium-2.wav';
import woodMedium3 from '../assets/sounds/wood/pop-medium-3.wav';
import woodHard1 from '../assets/sounds/wood/pop-hard-1.wav';
import woodHard2 from '../assets/sounds/wood/pop-hard-2.wav';
import woodHard3 from '../assets/sounds/wood/pop-hard-3.wav';
import carbonSoft1 from '../assets/sounds/carbon/pop-soft-1.wav';
import carbonSoft2 from '../assets/sounds/carbon/pop-soft-2.wav';
import carbonSoft3 from '../assets/sounds/carbon/pop-soft-3.wav';
import carbonMedium1 from '../assets/sounds/carbon/pop-medium-1.wav';
import carbonMedium2 from '../assets/sounds/carbon/pop-medium-2.wav';
import carbonMedium3 from '../assets/sounds/carbon/pop-medium-3.wav';
import carbonHard1 from '../assets/sounds/carbon/pop-hard-1.wav';
import carbonHard2 from '../assets/sounds/carbon/pop-hard-2.wav';
import carbonHard3 from '../assets/sounds/carbon/pop-hard-3.wav';
import thockSoft1 from '../assets/sounds/thock/pop-soft-1.wav';
import thockSoft2 from '../assets/sounds/thock/pop-soft-2.wav';
import thockSoft3 from '../assets/sounds/thock/pop-soft-3.wav';
import thockMedium1 from '../assets/sounds/thock/pop-medium-1.wav';
import thockMedium2 from '../assets/sounds/thock/pop-medium-2.wav';
import thockMedium3 from '../assets/sounds/thock/pop-medium-3.wav';
import thockHard1 from '../assets/sounds/thock/pop-hard-1.wav';
import thockHard2 from '../assets/sounds/thock/pop-hard-2.wav';
import thockHard3 from '../assets/sounds/thock/pop-hard-3.wav';
import clack1 from '../assets/sounds/clack-1.wav';
import clack2 from '../assets/sounds/clack-2.wav';
import bounce1 from '../assets/sounds/bounce-1.wav';
import bounce2 from '../assets/sounds/bounce-2.wav';
import deadBall from '../assets/sounds/dead-ball.wav';
import type { SoundName } from './soundMix';

export { CLACKS, PACKS, cueSound, hitSound, nextVariant, popsFor, tierFor } from './soundMix';
export type { Cue, Pack, SoundName, Tier } from './soundMix';

/** Every bundled sound by name. */
export const SOUNDS: Record<SoundName, number> = {
	'classic/pop-soft-1': classicSoft1, 'classic/pop-soft-2': classicSoft2, 'classic/pop-soft-3': classicSoft3,
	'classic/pop-medium-1': classicMedium1, 'classic/pop-medium-2': classicMedium2, 'classic/pop-medium-3': classicMedium3,
	'classic/pop-hard-1': classicHard1, 'classic/pop-hard-2': classicHard2, 'classic/pop-hard-3': classicHard3,
	'wood/pop-soft-1': woodSoft1, 'wood/pop-soft-2': woodSoft2, 'wood/pop-soft-3': woodSoft3,
	'wood/pop-medium-1': woodMedium1, 'wood/pop-medium-2': woodMedium2, 'wood/pop-medium-3': woodMedium3,
	'wood/pop-hard-1': woodHard1, 'wood/pop-hard-2': woodHard2, 'wood/pop-hard-3': woodHard3,
	'carbon/pop-soft-1': carbonSoft1, 'carbon/pop-soft-2': carbonSoft2, 'carbon/pop-soft-3': carbonSoft3,
	'carbon/pop-medium-1': carbonMedium1, 'carbon/pop-medium-2': carbonMedium2, 'carbon/pop-medium-3': carbonMedium3,
	'carbon/pop-hard-1': carbonHard1, 'carbon/pop-hard-2': carbonHard2, 'carbon/pop-hard-3': carbonHard3,
	'thock/pop-soft-1': thockSoft1, 'thock/pop-soft-2': thockSoft2, 'thock/pop-soft-3': thockSoft3,
	'thock/pop-medium-1': thockMedium1, 'thock/pop-medium-2': thockMedium2, 'thock/pop-medium-3': thockMedium3,
	'thock/pop-hard-1': thockHard1, 'thock/pop-hard-2': thockHard2, 'thock/pop-hard-3': thockHard3,
	'clack-1': clack1, 'clack-2': clack2, 'bounce-1': bounce1, 'bounce-2': bounce2, 'dead-ball': deadBall,
};
