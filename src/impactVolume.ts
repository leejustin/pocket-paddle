/**
 * Soft dinks stay clearly audible; the soft sound tier already sounds gentler,
 * so volume only needs to add the last bit of separation from a full drive.
 */
export function impactVolume(power: number): number {
	const strength = Number.isFinite(power) ? Math.max(0, Math.min(1, power)) : 0;
	return 0.28 + 0.72 * Math.pow(strength, 1.2);
}
