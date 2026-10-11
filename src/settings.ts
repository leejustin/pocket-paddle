import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULTS, KEY, parseSettings } from './settingsParse';
import type { Settings } from './settingsParse';

export { DEFAULTS, parseSettings } from './settingsParse';
export type { Settings } from './settingsParse';

export function useSettings() {
	const [settings, setSettings] = useState<Settings>(DEFAULTS);
	const [loaded, setLoaded] = useState(false);
	const dirty = useRef(false);
	useEffect(() => {
		let mounted = true;
		AsyncStorage.getItem(KEY).then(raw => {
			// A change made before loading finished wins over the saved copy.
			if (mounted && !dirty.current) setSettings(parseSettings(raw));
		}).catch(cause => console.warn('Could not load settings', cause))
			.finally(() => { if (mounted) setLoaded(true); });
		return () => { mounted = false; };
	}, []);
	useEffect(() => {
		if (!loaded) return;
		AsyncStorage.setItem(KEY, JSON.stringify(settings)).catch(cause => console.warn('Could not save settings', cause));
	}, [settings, loaded]);
	const update = useCallback((change: Partial<Settings> | ((current: Settings) => Partial<Settings>)) => {
		dirty.current = true;
		setSettings(current => ({ ...current, ...(typeof change === 'function' ? change(current) : change) }));
	}, []);
	return { settings, update };
}
