import { createPicker, cueSound, hitSound } from './soundMix';
import type { Cue, Pack, SoundName } from './soundMix';

// The browser's Web Audio API and react-native-audio-api share this shape, so
// one mixer drives both the web build and the low-latency native build.
type MixNode = { connect(destination: MixNode): unknown; disconnect(): void };
type Source<B> = MixNode & { buffer: B | null; start(): void; stop(): void };
type Gain = MixNode & { gain: { value: number } };
export type MixContext<B> = {
	readonly currentTime: number;
	readonly state: string;
	readonly destination: MixNode;
	resume(): Promise<unknown>;
	createBufferSource(): Source<B>;
	createGain(): Gain;
};
export type Buffers<B> = Record<SoundName, B>;

/** Decoded buffers overlap freely and start instantly; nothing seeks or reloads. */
export function createMixer<B>(context: MixContext<B>, buffers: Buffers<B>) {
	const pick = createPicker();
	const playing = new Set<Source<B>>();

	const start = (name: SoundName, volume: number) => {
		if (context.state !== 'running') void context.resume();
		const source = context.createBufferSource();
		const gain = context.createGain();
		source.buffer = buffers[name];
		gain.gain.value = volume;
		source.connect(gain);
		gain.connect(context.destination);
		playing.add(source);
		// Pops are 150 ms and the dead ball 1.2 s; free the nodes shortly after they finish.
		setTimeout(() => { playing.delete(source); source.disconnect(); gain.disconnect(); }, 1500);
		source.start();
	};
	return {
		hit(power: number, mishit: boolean, pack: Pack) {
			const sound = hitSound(pick, power, mishit, pack);
			start(sound.name, sound.volume);
		},
		cue(cue: Cue) {
			const sound = cueSound(pick, cue);
			start(sound.name, sound.volume);
		},
		stopAll() {
			for (const source of playing) source.stop();
			playing.clear();
		},
	};
}
export type Mixer = ReturnType<typeof createMixer>;
