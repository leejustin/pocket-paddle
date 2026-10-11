import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { SwingDetector, makeShot } from './motion';
import type { Shot } from './motion';
import { motionSensor } from './motionSensor';

type SessionOptions = {
	hit: (power: number, mishit?: boolean) => Promise<void>;
	pause: () => void;
	ready: boolean;
	/** Called on every sensor frame with 0..1 swing intensity and -1..1 side tilt, for visuals. */
	onMotion?: (swing: number, tilt: number) => void;
	/** Return false to let a swing pass silently, e.g. when there's no ball to hit in a rally. */
	accept?: (shot: Shot) => boolean;
};
type Subscription = { remove: () => void };

export function useSwingSession(options: SessionOptions) {
	const [active, setActive] = useState(false);
	const [starting, setStarting] = useState(false);
	const [shot, setShot] = useState<Shot & { id: number }>();
	const [notice, setNotice] = useState<string>();
	const detector = useRef(new SwingDetector());
	const subscription = useRef<Subscription | undefined>(undefined);
	const timer = useRef<{ cancel: () => void } | undefined>(undefined);
	const generation = useRef(0);
	const isActive = useRef(false);
	const isStarting = useRef(false);
	const latest = useRef(options);
	latest.current = options;
	const wakeTag = useRef<string | undefined>(undefined);

	const release = useCallback(() => {
		generation.current++;
		subscription.current?.remove();
		subscription.current = undefined;
		timer.current?.cancel();
		timer.current = undefined;
		isActive.current = false;
		isStarting.current = false;
		if (wakeTag.current) {
			deactivateKeepAwake(wakeTag.current);
			wakeTag.current = undefined;
		}
	}, []);
	const stop = useCallback(() => {
		release();
		setStarting(false);
		setActive(false);
		detector.current.reset();
		latest.current.pause();
		latest.current.onMotion?.(0, 0);
	}, [release]);
	const hit = useCallback((next: Shot) => {
		if (latest.current.accept?.(next) === false) return;
		setShot(previous => ({ ...next, id: (previous?.id ?? 0) + 1 }));
		latest.current.hit(next.power, next.mishit).catch(cause => {
			setNotice(cause instanceof Error ? cause.message : 'Could not play that sound.');
		});
		if (Platform.OS !== 'web') {
			// An edge hit feels dead in the hand; a clean smash thumps.
			const style = next.mishit || next.power < 0.3 ? Haptics.ImpactFeedbackStyle.Soft :
				next.power < 0.75 ? Haptics.ImpactFeedbackStyle.Rigid : Haptics.ImpactFeedbackStyle.Heavy;
			Haptics.impactAsync(style).catch(cause => console.warn('Haptic feedback unavailable', cause));
		}
	}, []);
	const start = useCallback(async () => {
		if (isActive.current || isStarting.current || !latest.current.ready) return;
		isStarting.current = true;
		setStarting(true);
		setNotice(undefined);
		const id = ++generation.current;
		// On the web, a soft confirmation pop inside the tap also unlocks audio. Apps start on their own, silently.
		if (Platform.OS === 'web') latest.current.hit(0.08).catch(cause => console.warn('Could not play grab sound', cause));
		try {
			// Safari requires requesting motion directly within the tap gesture.
			const permission = await motionSensor.requestPermissionsAsync();
			if (id !== generation.current) return;
			if (!permission.granted) { setNotice('Motion access is off. Allow motion for this app in Settings.'); return; }
			const available = await motionSensor.isAvailableAsync();
			if (id !== generation.current) return;
			if (!available) {
				// The iOS Simulator has no motion sensor; development builds let you tap the paddle instead.
				if (__DEV__ && Platform.OS !== 'web') {
					console.warn('No motion sensor: tap the paddle to swing (development builds only).');
					isActive.current = true;
					setActive(true);
					return;
				}
				setNotice('This device has no motion sensor.');
				return;
			}
			detector.current.reset();
			motionSensor.setUpdateInterval(10);
			isActive.current = true;
			setActive(true);
			let receivedData = false;
			subscription.current = motionSensor.addListener(sample => {
				if (!isActive.current || id !== generation.current) return;
				receivedData = true;
				const result = detector.current.feed(sample);
				const tilt = Math.max(-1, Math.min(1, sample.includingGravity.x / 9.81));
				latest.current.onMotion?.(result.swing, Number.isFinite(tilt) ? tilt : 0);
				if (result.shot) hit(result.shot);
			});
			const timeout = setTimeout(() => {
				if (id === generation.current && !receivedData) {
					stop();
					setNotice('No motion data arrived from the sensor.');
				}
			}, 8000);
			timer.current = { cancel: () => clearTimeout(timeout) };
			const tag = 'dink-session-' + id;
			activateKeepAwakeAsync(tag).then(() => {
				if (id !== generation.current) deactivateKeepAwake(tag);
				else wakeTag.current = tag;
			}).catch(cause => console.warn('Could not keep screen awake', cause));
		} catch (cause) {
			if (id === generation.current) {
				stop();
				console.warn('Motion could not start', cause);
				setNotice(cause instanceof Error && cause.message ? cause.message : 'Motion is unavailable.');
			}
		} finally {
			if (id === generation.current) { isStarting.current = false; setStarting(false); }
		}
	}, [hit, stop]);
	useEffect(() => {
		const listener = AppState.addEventListener('change', state => {
			if (state !== 'active' && (isActive.current || isStarting.current)) stop();
		});
		return () => {
			listener.remove();
			release();
			// Keep state honest if the hook outlives the subscription (e.g. Fast Refresh),
			// so the paddle never looks live while it isn't listening.
			setActive(false);
			setStarting(false);
		};
	}, [stop, release]);
	/** Desktop previews have no motion sensor, so a key press stands in for a swing. */
	const simulate = useCallback((peak = 760, mishit = false) => {
		if (latest.current.ready) hit(makeShot(peak, performance.now(), mishit));
	}, [hit]);
	const setSensitivity = useCallback((value: number) => detector.current.setSensitivity(value), []);
	return { active, starting, shot, notice, start, stop, simulate, setSensitivity };
}
