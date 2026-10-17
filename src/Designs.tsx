import { Circle, Ellipse, G, Line, Path, Rect, Text } from 'react-native-svg';

/**
 * Silly printed designs for the paddle face. Each is drawn around the sweet
 * spot at (0, 0) in units of 1/100 of the face width, so it fits any phone.
 * Roughly y −85…110 is visible on a phone and −50…70 on an iPad.
 */
export type Art = 'pickle-pal' | 'dill-with-it' | 'kitty' | 'toe-beans' | 'purrkle' | 'pickle-party';

const INK = '#1b1b1b';
const BLUSH = '#ff7aa2';
const PICKLE = { skin: '#79b33d', line: '#3f6b1c', shine: '#a6d465', bump: '#5d9430' };

export function DesignArt({ art }: { art: Art }) {
	switch (art) {
		case 'pickle-pal': return <>
			<Pickle y={12} rotate={-8} />
			<CuteFace />
		</>;
		case 'dill-with-it': return <>
			<Pickle y={12} rotate={6} />
			<Shades />
			<Path d="M -6 9 Q 2 13 10 6" stroke={INK} strokeWidth={2.4} strokeLinecap="round" fill="none" />
			{/* A hard drop shadow keeps the caption readable over both the pickle and the background. */}
			<Text x={1.2} y={75.2} fontSize={12.5} fontWeight="900" fontFamily="Arial" textAnchor="middle" fill={INK}>DILL WITH IT</Text>
			<Text x={0} y={74} fontSize={12.5} fontWeight="900" fontFamily="Arial" textAnchor="middle" fill="#ffffff">DILL WITH IT</Text>
		</>;
		case 'kitty': return <Cat fur="#f5a54a" line="#5a3311" mark="#d9822b" inner="#ffb3c7" />;
		case 'purrkle': return <Cat fur={PICKLE.skin} line={PICKLE.line} mark={PICKLE.bump} inner={PICKLE.shine} bumpy />;
		case 'toe-beans': return <>
			{[[-30, 62, 0.32, -18], [28, 86, 0.32, 12], [30, -66, 0.28, 24], [-28, -78, 0.26, -10]].map(([x, y, scale, rotate]) =>
				<G key={`${x}-${y}`} opacity={0.35} transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}><Paw /></G>)}
			<Paw />
		</>;
		case 'pickle-party': return <>
			{PARTY.map(([x, y, rotate]) => <Pickle key={`${x}-${y}`} x={x} y={y} rotate={rotate} scale={0.2} plain />)}
		</>;
	}
}

/** A dill pickle, standing up, centered on its middle. `plain` skips the bumps for small tiled pickles. */
function Pickle({ x = 0, y = 0, rotate = 0, scale = 1, plain = false }: { x?: number; y?: number; rotate?: number; scale?: number; plain?: boolean }) {
	return <G transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
		<Rect x={-27} y={-75} width={54} height={150} rx={27} fill={PICKLE.skin} stroke={PICKLE.line} strokeWidth={plain ? 6 : 2.5} />
		<Rect x={-17} y={-64} width={9} height={118} rx={4.5} fill={PICKLE.shine} opacity={0.6} />
		{!plain && BUMPS.map(([bx, by]) => <Ellipse key={`${bx}-${by}`} cx={bx} cy={by} rx={2.6} ry={3.4} fill={PICKLE.bump} />)}
		{plain && <>
			<Circle cx={-7} cy={-14} r={4.5} fill={INK} /><Circle cx={7} cy={-14} r={4.5} fill={INK} />
			<Path d="M -7 0 Q 0 8 7 0" stroke={INK} strokeWidth={4} strokeLinecap="round" fill="none" />
		</>}
	</G>;
}
const BUMPS = [[-12, -58], [10, -48], [18, -30], [-20, -36], [14, 32], [-16, 40], [6, 52], [-6, 64], [18, 60]];
// A loose grid of tiny pickles, nudged and tilted so it doesn't look stamped.
const PARTY = Array.from({ length: 6 * 9 }, (_, i) => {
	const col = i % 6 - 2.5;
	const row = Math.floor(i / 6) - 4;
	return [col * 21 + (row % 2 ? 7 : -7), row * 30, (i * 47) % 70 - 35];
});

/** Big friendly eyes, a smile and rosy cheeks, centered on the sweet spot. */
function CuteFace() {
	return <>
		<Ellipse cx={-17} cy={5} rx={4.5} ry={2.8} fill={BLUSH} opacity={0.55} />
		<Ellipse cx={17} cy={5} rx={4.5} ry={2.8} fill={BLUSH} opacity={0.55} />
		<Circle cx={-10} cy={-6} r={4.6} fill={INK} /><Circle cx={10} cy={-6} r={4.6} fill={INK} />
		<Circle cx={-8.5} cy={-7.5} r={1.6} fill="#ffffff" /><Circle cx={11.5} cy={-7.5} r={1.6} fill="#ffffff" />
		<Path d="M -7 5 Q 0 12 7 5" stroke={INK} strokeWidth={2.4} strokeLinecap="round" fill="none" />
	</>;
}

/** Pixel sunglasses. */
function Shades() {
	return <G fill="#111111">
		<Rect x={-26} y={-14} width={52} height={3} />
		<Rect x={-23} y={-11} width={19} height={6} /><Rect x={4} y={-11} width={19} height={6} />
		<Rect x={-20} y={-5} width={13} height={3} /><Rect x={7} y={-5} width={13} height={3} />
		<Rect x={-20} y={-10} width={3} height={2} fill="#ffffff" /><Rect x={7} y={-10} width={3} height={2} fill="#ffffff" />
	</G>;
}

/** A cat peeking up from the bottom, with its nose on the sweet spot. */
function Cat({ fur, line, mark, inner, bumpy = false }: { fur: string; line: string; mark: string; inner: string; bumpy?: boolean }) {
	const outline = { stroke: line, strokeWidth: 2.5, strokeLinejoin: 'round' as const };
	return <>
		<Ellipse cx={0} cy={56} rx={31} ry={30} fill={fur} {...outline} />
		<Ellipse cx={-16} cy={80} rx={13} ry={9} fill={fur} {...outline} />
		<Ellipse cx={16} cy={80} rx={13} ry={9} fill={fur} {...outline} />
		<Path d="M -38 -12 L -31 -56 L -7 -31 Z" fill={fur} {...outline} />
		<Path d="M 38 -12 L 31 -56 L 7 -31 Z" fill={fur} {...outline} />
		<Path d="M -31 -19 L -28 -45 L -14 -31 Z" fill={inner} /><Path d="M 31 -19 L 28 -45 L 14 -31 Z" fill={inner} />
		<Ellipse cx={0} cy={0} rx={42} ry={35} fill={fur} {...outline} />
		{bumpy
			? [[-22, -18], [20, -20], [-4, -28], [28, 2], [-30, 4]].map(([x, y]) => <Ellipse key={`${x}-${y}`} cx={x} cy={y} rx={2.4} ry={3} fill={mark} />)
			: <G stroke={mark} strokeWidth={3} strokeLinecap="round"><Line x1={-9} y1={-33} x2={-6} y2={-24} /><Line x1={0} y1={-35} x2={0} y2={-25} /><Line x1={9} y1={-33} x2={6} y2={-24} /></G>}
		<Ellipse cx={-25} cy={10} rx={5} ry={3} fill={BLUSH} opacity={0.5} />
		<Ellipse cx={25} cy={10} rx={5} ry={3} fill={BLUSH} opacity={0.5} />
		<Ellipse cx={-15} cy={-6} rx={6} ry={7.5} fill={INK} /><Ellipse cx={15} cy={-6} rx={6} ry={7.5} fill={INK} />
		<Circle cx={-13} cy={-9} r={2.2} fill="#ffffff" /><Circle cx={17} cy={-9} r={2.2} fill="#ffffff" />
		<Path d="M -4 3 L 4 3 L 0 7.5 Z" fill={BLUSH} />
		<Path d="M 0 7.5 Q -3 12 -7 10 M 0 7.5 Q 3 12 7 10" stroke={line} strokeWidth={2} strokeLinecap="round" fill="none" />
		<G stroke={line} strokeWidth={1.5} strokeLinecap="round">
			<Line x1={-22} y1={4} x2={-46} y2={0} /><Line x1={-22} y1={8} x2={-46} y2={10} />
			<Line x1={22} y1={4} x2={46} y2={0} /><Line x1={22} y1={8} x2={46} y2={10} />
		</G>
	</>;
}

/** A cat's paw print with pink toe beans; the big pad sits on the sweet spot. */
function Paw() {
	const bean = '#ff8fab';
	return <>
		<Path d="M -24 8 C -30 -10, -14 -20, 0 -20 C 14 -20, 30 -10, 24 8 C 20 22, -20 22, -24 8 Z" fill={bean} />
		<Ellipse cx={-30} cy={-34} rx={9} ry={11} fill={bean} transform="rotate(-20 -30 -34)" />
		<Ellipse cx={-11} cy={-48} rx={9} ry={11.5} fill={bean} />
		<Ellipse cx={11} cy={-48} rx={9} ry={11.5} fill={bean} />
		<Ellipse cx={30} cy={-34} rx={9} ry={11} fill={bean} transform="rotate(20 30 -34)" />
		<Ellipse cx={-6} cy={-8} rx={6} ry={3} fill="#ffffff" opacity={0.35} />
	</>;
}
