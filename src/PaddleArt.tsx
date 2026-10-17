import { memo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { DesignArt } from './Designs';
import type { Art } from './Designs';

export const GUARD = '#0d1016';
export const BALL = '#e4f53b';
/** `pro` faces come with Pocket Pickle Pro. `art` prints a silly design over the face color. */
export type Finish = { name: string; face: string; deep: string; print: string; pro?: boolean; art?: Art };
export const FINISHES: Finish[] = [
	{ name: 'Volt', face: '#c8f73a', deep: '#4f7a0c', print: '#1c2a05' },
	{ name: 'Coral', face: '#ff6a55', deep: '#9a2318', print: '#3a0b06' },
	{ name: 'Cobalt', face: '#4d8dff', deep: '#14388f', print: '#06143a' },
	{ name: 'Violet', face: '#a874ff', deep: '#431b94', print: '#1a073d' },
	{ name: 'Gold', face: '#f4c542', deep: '#8a5a00', print: '#2e1f00', pro: true },
	{ name: 'Carbon', face: '#3a3f48', deep: '#0b0d11', print: '#e8edf3', pro: true },
	{ name: 'Ice', face: '#bfeaff', deep: '#3b86b5', print: '#06263a', pro: true },
	{ name: 'Sunset', face: '#ff9a3c', deep: '#b0245c', print: '#3a0717', pro: true },
];
/** Silly printed designs, all part of Pro. */
export const DESIGNS: Finish[] = [
	{ name: 'Pickle Pal', face: '#fff1b8', deep: '#e9b949', print: '#2f4a12', pro: true, art: 'pickle-pal' },
	{ name: 'Dill With It', face: '#ff7eb6', deep: '#c2185b', print: '#2b0718', pro: true, art: 'dill-with-it' },
	{ name: 'Kitty', face: '#c9b6ff', deep: '#7a5fd6', print: '#1d1240', pro: true, art: 'kitty' },
	{ name: 'Purrkle', face: '#9fd8ff', deep: '#3a7bbf', print: '#0b2340', pro: true, art: 'purrkle' },
	{ name: 'Toe Beans', face: '#fff3e6', deep: '#f2b8a2', print: '#4a1424', pro: true, art: 'toe-beans' },
	{ name: 'Pickle Party', face: '#ffe066', deep: '#f59f00', print: '#3d2a00', pro: true, art: 'pickle-party' },
];
/** Your own photo on the face. Its colors only tint the controls drawn on top. */
export const PHOTO: Finish = { name: 'Photo', face: '#f6f8ef', deep: '#7d8794', print: '#0d1016', pro: true };

export type FaceProps = { width: number; height: number; finish: Finish; sweet: { x: number; y: number; r: number }; photo?: string };
/** Drawn in screen pixels so the face always fills the phone exactly. */
export const Face = memo(function Face({ width: w, height: h, finish, sweet, photo }: FaceProps) {
	const guard = Math.max(9, w * 0.028);
	const radius = Math.min(w, h) * 0.12;
	// The face ends just above your hand; the handle runs off the bottom edge into it.
	const faceBottom = h * 0.925;
	const neck = w * 0.12;
	const weave = Array.from({ length: Math.ceil((h + w) / 14) }, (_, i) => i * 14);
	const clip = <ClipPath id="faceClip"><Rect x={guard} y={guard} width={w - guard * 2} height={faceBottom - guard * 2} rx={radius} /></ClipPath>;
	const spot = <RadialGradient id="spot" cx={sweet.x} cy={sweet.y} r={sweet.r * 2.4} gradientUnits="userSpaceOnUse">
		<Stop offset="0" stopColor="#ffffff" stopOpacity="0.18" /><Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
	</RadialGradient>;
	const ring = photo ? '#ffffff' : finish.print;
	/** Surface details drawn over the face: weave, sweet-spot glow and the sweet-spot ring. */
	const marks = <>
		<G stroke="#000000" strokeOpacity="0.06" strokeWidth="1">
			{weave.map(offset => <Line key={offset} x1={0} y1={offset} x2={w} y2={offset - w * 0.35} />)}
		</G>
		<Rect width={w} height={h} fill="url(#spot)" />
		{!photo && !finish.art && <>
			{/* Printed graphics, like a real paddle's cosmetics */}
			<Path d={`M 0 ${h * 0.74} L ${w} ${h * 0.62}`} stroke={finish.print} strokeOpacity="0.14" strokeWidth={w * 0.09} />
			<Path d={`M 0 ${h * 0.81} L ${w} ${h * 0.69}`} stroke={finish.print} strokeOpacity="0.09" strokeWidth={w * 0.025} />
		</>}
		<Circle cx={sweet.x} cy={sweet.y} r={sweet.r} fill="none" stroke={ring} strokeOpacity={photo ? 0.6 : 0.28} strokeWidth="2.5" strokeDasharray="6 7" />
		<Circle cx={sweet.x} cy={sweet.y} r={3} fill={ring} fillOpacity="0.35" />
	</>;
	if (photo) {
		// The photo is a native image so the system can decode it at screen size.
		return <View style={{ width: w, height: h }}>
			<Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
				<Defs><LinearGradient id="grip" x1="0" y1="0" x2="1" y2="0">
					<Stop offset="0" stopColor="#14171d" /><Stop offset="0.5" stopColor="#2a303b" /><Stop offset="1" stopColor="#14171d" />
				</LinearGradient></Defs>
				<Rect width={w} height={h} fill={GUARD} />
				<Handle w={w} h={h} guard={guard} faceBottom={faceBottom} neck={neck} />
			</Svg>
			<View style={[styles.photo, { left: guard, top: guard, width: w - guard * 2, height: faceBottom - guard * 2, borderRadius: radius }]}>
				<Image source={{ uri: photo }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
			</View>
			<Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={StyleSheet.absoluteFill} pointerEvents="none">
				<Defs>{spot}{clip}</Defs>
				<G clipPath="url(#faceClip)">{marks}</G>
			</Svg>
		</View>;
	}
	return <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
		<Defs>
			<LinearGradient id="face" x1="0" y1="0" x2="1" y2="1">
				<Stop offset="0" stopColor={finish.face} /><Stop offset="0.7" stopColor={finish.face} stopOpacity="0.92" /><Stop offset="1" stopColor={finish.deep} />
			</LinearGradient>
			{spot}
			<LinearGradient id="grip" x1="0" y1="0" x2="1" y2="0">
				<Stop offset="0" stopColor="#14171d" /><Stop offset="0.5" stopColor="#2a303b" /><Stop offset="1" stopColor="#14171d" />
			</LinearGradient>
			{clip}
		</Defs>
		<Rect width={w} height={h} fill={GUARD} />
		<Handle w={w} h={h} guard={guard} faceBottom={faceBottom} neck={neck} />
		<G clipPath="url(#faceClip)">
			<Rect width={w} height={h} fill="url(#face)" />
			{finish.art && <G transform={`translate(${sweet.x} ${sweet.y}) scale(${w / 100})`}><DesignArt art={finish.art} /></G>}
			{marks}
		</G>
	</Svg>;
});

/** Throat and grip, running off the bottom edge into your hand. Uses the `grip` gradient. */
function Handle({ w, h, guard, faceBottom, neck }: { w: number; h: number; guard: number; faceBottom: number; neck: number }) {
	return <>
		<Path d={`M ${w / 2 - neck * 1.7} ${faceBottom - guard} Q ${w / 2 - neck} ${faceBottom + h * 0.01}, ${w / 2 - neck} ${h} L ${w / 2 + neck} ${h} Q ${w / 2 + neck} ${faceBottom + h * 0.01}, ${w / 2 + neck * 1.7} ${faceBottom - guard} Z`} fill="#161a21" />
		<Rect x={w / 2 - neck * 0.82} y={faceBottom + h * 0.012} width={neck * 1.64} height={h} rx={6} fill="url(#grip)" />
		{[0, 1, 2, 3].map(i => <Line key={i} x1={w / 2 - neck * 0.82} y1={faceBottom + h * (0.03 + i * 0.016)} x2={w / 2 + neck * 0.82} y2={faceBottom + h * (0.022 + i * 0.016)} stroke="#454c5a" strokeWidth={3} />)}
	</>;
}

export const Sheen = memo(function Sheen({ width, height }: { width: number; height: number }) {
	return <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
		<Defs><LinearGradient id="sheen" x1="0" y1="0" x2="1" y2="0">
			<Stop offset="0" stopColor="#ffffff" stopOpacity="0" /><Stop offset="0.5" stopColor="#ffffff" stopOpacity="0.2" /><Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
		</LinearGradient></Defs>
		<Rect width={width} height={height} fill="url(#sheen)" />
	</Svg>;
});

export const Ball = memo(function Ball({ size }: { size: number }) {
	const holes = [[50, 22], [27, 40], [73, 40], [36, 68], [64, 68], [50, 48]];
	return <Svg width={size} height={size} viewBox="0 0 100 100">
		<Defs><RadialGradient id="ball" cx="38" cy="34" r="66" gradientUnits="userSpaceOnUse">
			<Stop offset="0" stopColor="#fbffc4" /><Stop offset="0.45" stopColor={BALL} /><Stop offset="1" stopColor="#a6b51c" />
		</RadialGradient></Defs>
		<Circle cx="50" cy="50" r="48" fill="url(#ball)" />
		{holes.map(([x, y]) => <Circle key={`${x}-${y}`} cx={x} cy={y} r="6.5" fill="#7f8c12" opacity="0.75" />)}
	</Svg>;
});

const styles = StyleSheet.create({
	photo: { position: 'absolute', overflow: 'hidden', backgroundColor: '#1a1f27' },
});
