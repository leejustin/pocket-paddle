import type { MotionSample, Vector } from './motion';

// Expo SDK 57's web DeviceMotion emitter lacks addListener. Use the browser's
// native event here; the shipped iOS/Android app still uses expo-sensors.
export const motionSensor = {
	async requestPermissionsAsync() {
		if (!window.isSecureContext) throw new Error('Motion is unavailable here. Tap the paddle to dink.');
		if (typeof DeviceMotionEvent === 'undefined') return { granted: false };
		if ('requestPermission' in DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') {
			const permission: unknown = await DeviceMotionEvent.requestPermission();
			return { granted: permission === 'granted' };
		}
		return { granted: true };
	},
	async isAvailableAsync() { return typeof DeviceMotionEvent !== 'undefined'; },
	setUpdateInterval(_interval: number) { /* The browser controls its sensor rate. */ },
	addListener(listener: (sample: MotionSample) => void) {
		const handle = (event: DeviceMotionEvent) => {
			const includingGravity = vector(event.accelerationIncludingGravity);
			if (!includingGravity) return;
			const rotationRate = event.rotationRate;
			listener({
				time: performance.now(), includingGravity,
				acceleration: vector(event.acceleration), gravitySign: 1,
				rotationRate: rotationRate && rotationRate.alpha !== null &&
					rotationRate.beta !== null && rotationRate.gamma !== null ?
					{ x: rotationRate.beta, y: rotationRate.gamma, z: rotationRate.alpha } : undefined,
			});
		};
		window.addEventListener('devicemotion', handle);
		return { remove: () => window.removeEventListener('devicemotion', handle) };
	},
};

function vector(value: DeviceMotionEventAcceleration | null): Vector | undefined {
	if (!value || value.x === null || value.y === null || value.z === null) return undefined;
	return { x: value.x, y: value.y, z: value.z };
}
