import type { DeviceMotionMeasurement } from 'expo-sensors';
import type { MotionSample } from './motion';

export function normalizeMotion(measurement: DeviceMotionMeasurement, time: number, platform: 'native' | 'web'): MotionSample {
	return {
		time,
		acceleration: measurement.acceleration ?? undefined,
		includingGravity: measurement.accelerationIncludingGravity,
		// Expo's iOS and Android implementations report physical downward gravity.
		// The web implementation passes through the browser's upward g-force vector.
		gravitySign: platform === 'native' ? -1 : 1,
		rotationRate: measurement.rotationRate ? {
			x: measurement.rotationRate.beta, y: measurement.rotationRate.gamma, z: measurement.rotationRate.alpha,
		} : undefined,
	};
}
