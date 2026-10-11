import { useCallback, useEffect, useRef, useState } from 'react';
import { TurboModuleRegistry } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import { createMixer } from './mixer';
import type { Buffers, MixContext } from './mixer';
import { SOUNDS, cueSound, hitSound } from './sounds';
import type { Cue, Pack, SoundName } from './sounds';
import { createPicker } from './soundMix';

type Engine = {
	hit: (power: number, mishit: boolean, pack: Pack) => void;
	cue: (cue: Cue) => void;
	stopAll: () => void;
	release: () => void;
};
const NAMES = Object.keys(SOUNDS) as SoundName[];
// react-native-audio-api needs a development build; Expo Go doesn't include it.
const LOW_LATENCY = TurboModuleRegistry.get('AudioAPIModule') != null;

/** `pack` is the paddle sound every hit uses. */
export function usePaddleAudio(pack: Pack) {
	const engine = useRef<Engine | undefined>(undefined);
	const packRef = useRef(pack);
	packRef.current = pack;
	const [ready, setReady] = useState(false);
	const [error, setError] = useState<string>();
	useEffect(() => {
		let mounted = true;
		let loaded: Engine | undefined;
		(LOW_LATENCY ? lowLatencyEngine() : expoAudioEngine()).then(created => {
			loaded = created;
			if (!mounted) { created.release(); return; }
			engine.current = created;
			setReady(true);
		}).catch(cause => {
			if (mounted) setError(`Audio setup failed: ${cause instanceof Error ? cause.message : 'unknown error'}`);
		});
		return () => {
			mounted = false;
			engine.current = undefined;
			loaded?.release();
		};
	}, []);
	const hit = useCallback(async (power: number, mishit = false) => { engine.current?.hit(power, mishit, packRef.current); }, []);
	const cue = useCallback((name: Cue) => engine.current?.cue(name), []);
	/** Plays one medium hit in another pack, so people can hear it before choosing it. */
	const preview = useCallback((other: Pack) => engine.current?.hit(0.5, false, other), []);
	const pause = useCallback(() => engine.current?.stopAll(), []);
	return { ready, error, hit, cue, preview, pause };
}

/** Web Audio-style buffers rendered on the native audio thread: the quickest path from swing to sound. */
async function lowLatencyEngine(): Promise<Engine> {
	const api = await import('react-native-audio-api');
	api.AudioManager.setAudioSessionOptions({
		iosCategory: 'playback', iosMode: 'default', iosOptions: ['mixWithOthers'], iosAllowHaptics: true,
	});
	await api.AudioManager.setAudioSessionActivity(true);
	const context = new api.AudioContext();
	const decoded = await Promise.all(NAMES.map(name => context.decodeAudioData(SOUNDS[name])));
	const buffers = Object.fromEntries(NAMES.map((name, i) => [name, decoded[i]])) as Buffers<(typeof decoded)[number]>;
	const mixer = createMixer(context as unknown as MixContext<(typeof decoded)[number]>, buffers);
	return { ...mixer, release: () => { mixer.stopAll(); void context.close().catch(cause => console.warn('Could not close audio', cause)); } };
}

/** Expo Go fallback: one preloaded player per sound, rewound as soon as it finishes. */
async function expoAudioEngine(): Promise<Engine> {
	await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'mixWithOthers' });
	const options = { downloadFirst: true, updateInterval: 50, keepAudioSessionActive: true };
	const players = Object.fromEntries(NAMES.map(name => [name, createAudioPlayer(SOUNDS[name], options)])) as Record<SoundName, AudioPlayer>;
	const rewinds = Object.values(players).map(player => player.addListener('playbackStatusUpdate', status => {
		if (status.didJustFinish) player.seekTo(0).catch(cause => console.warn('Could not rewind sound', cause));
	}));
	await new Promise<void>((resolve, reject) => {
		const started = Date.now();
		const poll = setInterval(() => {
			if (Object.values(players).every(player => player.isLoaded)) { clearInterval(poll); resolve(); }
			else if (Date.now() - started > 10_000) { clearInterval(poll); reject(new Error('Sounds took too long to load.')); }
		}, 50);
	});
	const pick = createPicker();
	const start = ({ name, volume }: { name: SoundName; volume: number }) => {
		const player = players[name];
		player.volume = volume;
		if (player.playing || player.currentTime > 0.003) void player.seekTo(0).then(() => player.play());
		else player.play();
	};
	return {
		hit(power, mishit, pack) { start(hitSound(pick, power, mishit, pack)); },
		cue(cue) { start(cueSound(pick, cue)); },
		stopAll() {
			for (const player of Object.values(players)) player.pause();
		},
		release() {
			for (const subscription of rewinds) subscription.remove();
			for (const player of Object.values(players)) player.remove();
		},
	};
}
