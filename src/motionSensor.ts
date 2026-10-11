import { DeviceMotion } from 'expo-sensors';
import { normalizeMotion } from './normalizeMotion';
import type { MotionSample } from './motion';

export const motionSensor = {
	requestPermissionsAsync: () => DeviceMotion.requestPermissionsAsync(),
	isAvailableAsync: () => DeviceMotion.isAvailableAsync(),
	setUpdateInterval: (interval: number) => DeviceMotion.setUpdateInterval(interval),
	addListener: (listener: (sample: MotionSample) => void) =>
		DeviceMotion.addListener(value => listener(normalizeMotion(value, performance.now(), 'native'))),
};
