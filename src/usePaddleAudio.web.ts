import { useCallback, useEffect, useRef, useState } from 'react';
import { Asset } from 'expo-asset';
import { createMixer } from './mixer';
import type { Buffers, MixContext, Mixer } from './mixer';
import { SOUNDS } from './sounds';
import type { Cue, Pack } from './sounds';

/** `pack` is the paddle sound every hit uses. */
export function usePaddleAudio(pack: Pack) {
	const mixer = useRef<Mixer | undefined>(undefined);
	const packRef = useRef(pack);
	packRef.current = pack;
	const [ready, setReady] = useState(false);
	const [error, setError] = useState<string>();
	useEffect(() => {
		let mounted = true;
		const context = new AudioContext({ latencyHint: 'interactive' });
		const decode = async (module: number) => {
			const response = await fetch(Asset.fromModule(module).uri);
			if (!response.ok) throw new Error('Could not load the paddle sounds.');
			return context.decodeAudioData(await response.arrayBuffer());
		};
		const names = Object.keys(SOUNDS) as (keyof typeof SOUNDS)[];
		Promise.all(names.map(name => decode(SOUNDS[name]))).then(decoded => {
			if (!mounted) return;
			const buffers = Object.fromEntries(names.map((name, i) => [name, decoded[i]])) as Buffers<AudioBuffer>;
			mixer.current = createMixer(context as unknown as MixContext<AudioBuffer>, buffers);
			setReady(true);
		}).catch(cause => {
			if (mounted) setError(cause instanceof Error ? cause.message : 'Audio could not load.');
		});
		return () => {
			mounted = false;
			mixer.current = undefined;
			void context.close().catch(cause => console.warn('Could not close audio', cause));
		};
	}, []);
	const hit = useCallback(async (power: number, mishit = false) => { mixer.current?.hit(power, mishit, packRef.current); }, []);
	const cue = useCallback((name: Cue) => mixer.current?.cue(name), []);
	const preview = useCallback((other: Pack) => mixer.current?.hit(0.5, false, other), []);
	const pause = useCallback(() => mixer.current?.stopAll(), []);
	return { ready, error, hit, cue, preview, pause };
}
