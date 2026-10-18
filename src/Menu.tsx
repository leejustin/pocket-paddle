import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { DESIGNS, FINISHES, PHOTO } from './PaddleArt';
import { DesignArt } from './Designs';
import type { Finish } from './PaddleArt';
import { PACKS } from './sounds';
import type { Pack } from './sounds';
import type { Pro } from './usePro';

export const INK = '#f6f8ef';
const MUTED = '#8fa0b3';
export const SENSITIVITY = [{ label: 'Chill', value: 0.2 }, { label: 'Normal', value: 0.5 }, { label: 'Twitchy', value: 0.85 }];

type MenuProps = {
	visible: boolean; onClose: () => void;
	/** Web only: apps keep the paddle live while they're open. */
	onPutDown?: () => void;
	finish: Finish; onFinish: (finish: Finish) => void;
	/** Shown when there's a saved photo; picking Photo without one opens the library. */
	photo?: string; onPickPhoto: () => void;
	pack: Pack; onPack: (pack: Pack) => void; onPreview: (pack: Pack) => void;
	sensitivity: number; onSensitivity: (index: number) => void;
	pro: Pro;
	/** Missing where rally mode isn't available (Expo Go, the web). */
	rally?: {
		playing: boolean; onFind: () => void; onLeave: () => void; buzz: boolean; onBuzz: (on: boolean) => void;
		/** Missing where doubles isn't available (Android). Hosting needs Pro; joining is free. */
		doubles?: { onHost: () => void; onJoin: () => void };
	};
};

export function Menu(props: MenuProps) {
	const { visible, onClose, onPutDown, finish, pro } = props;
	const [page, setPage] = useState<'main' | 'pro'>('main');
	const [heard, setHeard] = useState<Pack>();
	useEffect(() => { if (!visible) { setPage('main'); setHeard(undefined); } }, [visible]);
	const locked = (item: { pro?: boolean }) => !!item.pro && !pro.owned;
	const choosePack = (pack: (typeof PACKS)[number]) => {
		if (!locked(pack)) { props.onPack(pack.id); props.onPreview(pack.id); return; }
		// Locked packs still play, so people can hear what they'd get.
		props.onPreview(pack.id);
		setHeard(pack.id);
	};
	const photoAllowed = Platform.OS !== 'web';
	return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
		<View style={styles.backdrop}><View accessibilityViewIsModal style={styles.sheet}><ScrollView contentContainerStyle={styles.content}>
			{page === 'pro' ? <ProPage pro={pro} finish={finish} onBack={() => setPage('main')} /> : <>
				<Text accessibilityRole="header" style={styles.title}>Paddle</Text>

				<Text style={styles.label}>Face</Text>
				<View style={styles.swatches} accessibilityRole="radiogroup" accessibilityLabel="Paddle face">
					{FINISHES.map(option => <Pressable key={option.name}
						onPress={() => locked(option) ? setPage('pro') : props.onFinish(option)} accessibilityRole="radio"
						accessibilityLabel={locked(option) ? `${option.name}, Pro` : option.name} accessibilityState={{ selected: option.name === finish.name }}
						style={[styles.swatch, option.name === finish.name && { borderColor: option.face }]}>
						<View style={[styles.swatchDot, { backgroundColor: option.face }]} />
						{locked(option) && <Badge />}
					</Pressable>)}
					{photoAllowed && <Pressable onPress={() => locked(PHOTO) ? setPage('pro') : props.photo ? props.onFinish(PHOTO) : props.onPickPhoto()}
						accessibilityRole="radio" accessibilityLabel={locked(PHOTO) ? 'Your photo, Pro' : 'Your photo'}
						accessibilityState={{ selected: finish.name === PHOTO.name }}
						style={[styles.swatch, finish.name === PHOTO.name && { borderColor: INK }]}>
						<View style={[styles.swatchDot, styles.photoDot]}><Text style={styles.photoGlyph}>+</Text></View>
						{locked(PHOTO) && <Badge />}
					</Pressable>}
				</View>
				<Text style={styles.label}>Designs</Text>
				<View style={styles.swatches} accessibilityRole="radiogroup" accessibilityLabel="Paddle design">
					{DESIGNS.map(option => <Pressable key={option.name}
						onPress={() => locked(option) ? setPage('pro') : props.onFinish(option)} accessibilityRole="radio"
						accessibilityLabel={locked(option) ? `${option.name}, Pro` : option.name} accessibilityState={{ selected: option.name === finish.name }}
						style={[styles.swatch, option.name === finish.name && { borderColor: option.face }]}>
						<View style={styles.designDot}>
							{option.art && <Svg width="100%" height="100%" viewBox="-50 -50 100 100">
								<Rect x={-50} y={-50} width={100} height={100} fill={option.face} />
								<DesignArt art={option.art} />
							</Svg>}
						</View>
						{locked(option) && <Badge />}
					</Pressable>)}
				</View>
				{finish.art && <Text style={styles.hint}>{finish.name}</Text>}
				{finish.name === PHOTO.name && <Pressable onPress={props.onPickPhoto} accessibilityRole="button" style={styles.link}>
					<Text style={styles.linkText}>Choose a different photo</Text>
				</Pressable>}

				<Text style={styles.label}>Sound</Text>
				<View style={styles.segments} accessibilityRole="radiogroup" accessibilityLabel="Paddle sound">
					{PACKS.map(pack => <Pressable key={pack.id} onPress={() => choosePack(pack)} accessibilityRole="radio"
						accessibilityLabel={locked(pack) ? `${pack.label}, Pro. Plays a preview` : pack.label}
						accessibilityState={{ selected: pack.id === props.pack }}
						style={[styles.segment, pack.id === props.pack && { backgroundColor: finish.face }]}>
						<Text style={[styles.segmentText, pack.id === props.pack && { color: finish.print }]}>{pack.label}</Text>
						{locked(pack) && <Text style={styles.segmentPro}>PRO</Text>}
					</Pressable>)}
				</View>
				{heard && <Text style={styles.hint}>
					That’s {PACKS.find(pack => pack.id === heard)?.label}. <Text onPress={() => setPage('pro')} style={styles.hintLink}>Unlock it with Pro</Text>
				</Text>}

				<Text style={styles.label}>Swing sensitivity</Text>
				<Segments accent={finish} value={String(props.sensitivity)} onChange={value => props.onSensitivity(Number(value))}
					options={SENSITIVITY.map((option, index) => ({ value: String(index), label: option.label }))} />

				{props.rally && <>
					<Text style={styles.label}>Rally with a friend</Text>
					{props.rally.playing
						? <Pressable onPress={() => { props.rally?.onLeave(); onClose(); }} accessibilityRole="button" style={styles.outline}>
							<Text style={styles.outlineText}>Leave the game</Text>
						</Pressable>
						: <>
							<Text style={styles.body}>Two phones, one rally. Swing any time the ring shows; the bounce is the sweet spot.</Text>
							<Pressable onPress={() => { props.rally?.onFind(); onClose(); }} accessibilityRole="button" style={styles.outline}>
								<Text style={styles.outlineText}>Find a friend nearby</Text>
							</Pressable>
							{props.rally.doubles && <>
								<Text style={styles.label}>Doubles</Text>
								<Text style={styles.body}>Four phones, two teams. The host needs Pro; everyone else joins free.</Text>
								<View style={styles.pair}>
									<Pressable onPress={() => { if (!pro.owned) return setPage('pro'); props.rally?.doubles?.onHost(); onClose(); }}
										accessibilityRole="button" accessibilityLabel={pro.owned ? 'Host doubles' : 'Host doubles, Pro'} style={[styles.outline, styles.half]}>
										<Text style={styles.outlineText}>Host</Text>
										{!pro.owned && <Text style={styles.inlineBadge}>PRO</Text>}
									</Pressable>
									<Pressable onPress={() => { props.rally?.doubles?.onJoin(); onClose(); }} accessibilityRole="button"
										accessibilityLabel="Join doubles" style={[styles.outline, styles.half]}>
										<Text style={styles.outlineText}>Join</Text>
									</Pressable>
								</View>
							</>}
						</>}
					<Text style={styles.label}>Buzz when it’s time to swing</Text>
					<Segments accent={finish} value={props.rally.buzz ? 'on' : 'off'} onChange={value => props.rally?.onBuzz(value === 'on')}
						options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
				</>}

				{!pro.owned && <Pressable onPress={() => setPage('pro')} accessibilityRole="button" style={styles.proCard}>
					<Text style={styles.proTitle}>Pocket Pickle Pro{pro.price ? ` · ${pro.price}` : ''}</Text>
					<Text style={styles.proCopy}>Six silly designs, three more sounds, four more colors, your photo on the paddle, and hosting doubles. One-time unlock.</Text>
				</Pressable>}

				<Text style={styles.fine}>Hold on tight and give yourself room. Sounds are synthesized on-device from measurements of real pickleball contacts. Works offline. Your settings and paddle photo stay on this phone; Pro purchases are checked with the App Store through RevenueCat.</Text>
				<Pressable onPress={onClose} accessibilityRole="button" style={[styles.done, { backgroundColor: finish.face }]}><Text style={[styles.doneText, { color: finish.print }]}>Back to swinging</Text></Pressable>
				{onPutDown && <Pressable onPress={onPutDown} accessibilityRole="button" style={styles.putDown}><Text style={styles.putDownText}>Put the paddle down</Text></Pressable>}
			</>}
		</ScrollView></View></View>
	</Modal>;
}

function ProPage({ pro, finish, onBack }: { pro: Pro; finish: Finish; onBack: () => void }) {
	return <>
		<Text accessibilityRole="header" style={styles.title}>Pocket Pickle Pro</Text>
		{pro.owned ? <Text style={styles.body}>Pro is unlocked: every design, sound and color, your photo on the paddle, and hosting doubles. Thanks for supporting Pocket Pickle!</Text> : <>
			<Text style={styles.body}>Pro adds:</Text>
			<Text style={styles.bullet}>• Six silly designs: Pickle Pal, Dill With It, Kitty, Purrkle, Toe Beans and Pickle Party</Text>
			<Text style={styles.bullet}>• Three more paddle sounds: Wood, Carbon and Thock</Text>
			<Text style={styles.bullet}>• Four more colors: Gold, Carbon, Ice and Sunset</Text>
			<Text style={styles.bullet}>• Your own photo on the paddle face</Text>
			<Text style={styles.bullet}>• Host doubles: four phones, two teams. Only the host needs Pro; the other three play free</Text>
			<Text style={styles.body}>Always free: swinging, four colors, the Classic sound, one-on-one rallies, and joining a friend’s doubles game.</Text>
			<Text style={styles.body}>One-time purchase. No ads, no subscription.</Text>
			{pro.available
				? <Pressable onPress={pro.buy} disabled={pro.busy} accessibilityRole="button" accessibilityState={{ busy: pro.busy }}
					style={[styles.done, { backgroundColor: finish.face, opacity: pro.busy ? 0.6 : 1 }]}>
					<Text style={[styles.doneText, { color: finish.print }]}>{pro.busy ? 'Talking to the store…' : pro.price ? `Unlock for ${pro.price}` : 'Unlock Pro'}</Text>
				</Pressable>
				: <Text style={styles.hint}>Pro is available in the iPhone app.</Text>}
			{pro.available && <Pressable onPress={pro.restore} disabled={pro.busy} accessibilityRole="button" style={styles.link}>
				<Text style={styles.linkText}>Restore purchase</Text>
			</Pressable>}
		</>}
		{pro.message && <Text style={styles.notice}>{pro.message}</Text>}
		{pro.toggleForTesting && <Pressable onPress={pro.toggleForTesting} accessibilityRole="button" style={styles.link}>
			<Text style={styles.linkText}>{pro.owned ? 'Dev build: lock Pro again' : 'Dev build: unlock without paying'}</Text>
		</Pressable>}
		<Pressable onPress={onBack} accessibilityRole="button" style={styles.putDown}><Text style={styles.putDownText}>Back</Text></Pressable>
	</>;
}

function Badge() {
	return <View style={styles.badge}><Text style={styles.badgeText}>PRO</Text></View>;
}

type SegmentsProps<V extends string> = { value: V; onChange: (value: V) => void; options: { value: V; label: string }[]; accent: Finish };
function Segments<V extends string>({ value, onChange, options, accent }: SegmentsProps<V>) {
	return <View style={styles.segments} accessibilityRole="radiogroup">
		{options.map(option => <Pressable key={option.value} onPress={() => onChange(option.value)} accessibilityRole="radio"
			accessibilityState={{ selected: option.value === value }} style={[styles.segment, option.value === value && { backgroundColor: accent.face }]}>
			<Text style={[styles.segmentText, option.value === value && { color: accent.print }]}>{option.label}</Text>
		</Pressable>)}
	</View>;
}

const styles = StyleSheet.create({
	backdrop: { flex: 1, backgroundColor: '#000000b0', justifyContent: 'center', alignItems: 'center', padding: 16 },
	sheet: { width: '100%', maxWidth: 420, maxHeight: '92%', borderRadius: 24, backgroundColor: '#111722', borderWidth: 1, borderColor: '#ffffff1a' },
	content: { padding: 22 },
	title: { color: INK, fontSize: 24, fontWeight: '900', letterSpacing: -0.8 },
	label: { color: MUTED, fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 18, marginBottom: 8 },
	swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
	swatch: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
	swatchDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: '#ffffff26' },
	designDot: { width: 38, height: 38, borderRadius: 19, overflow: 'hidden', borderWidth: 1, borderColor: '#ffffff26' },
	photoDot: { backgroundColor: '#ffffff14', alignItems: 'center', justifyContent: 'center' },
	photoGlyph: { color: INK, fontSize: 18, fontWeight: '800', marginTop: -2 },
	badge: { position: 'absolute', bottom: -2, paddingHorizontal: 4, borderRadius: 6, backgroundColor: '#05080d' },
	badgeText: { color: INK, fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
	segments: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 16, backgroundColor: '#ffffff10' },
	segment: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
	segmentText: { color: INK, fontWeight: '800', fontSize: 14 },
	segmentPro: { color: MUTED, fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
	hint: { color: MUTED, fontSize: 13, lineHeight: 19, marginTop: 8 },
	hintLink: { color: INK, fontWeight: '800', textDecorationLine: 'underline' },
	body: { color: '#c4ccd6', fontSize: 15, lineHeight: 21, marginTop: 10 },
	bullet: { color: INK, fontSize: 15, lineHeight: 22, marginTop: 8 },
	notice: { color: '#ffb7a8', fontSize: 14, lineHeight: 20, marginTop: 12 },
	link: { marginTop: 6, minHeight: 44, justifyContent: 'center' },
	linkText: { color: INK, fontSize: 14, fontWeight: '800', textDecorationLine: 'underline' },
	outline: { marginTop: 10, minHeight: 48, borderRadius: 24, borderWidth: 1.5, borderColor: '#ffffff40', alignItems: 'center', justifyContent: 'center' },
	pair: { flexDirection: 'row', gap: 10 },
	half: { flex: 1, flexDirection: 'row', gap: 8 },
	inlineBadge: { color: INK, fontSize: 10, fontWeight: '900', letterSpacing: 1, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6, backgroundColor: '#05080d', overflow: 'hidden' },
	outlineText: { color: INK, fontWeight: '900', fontSize: 16 },
	proCard: { marginTop: 22, padding: 16, borderRadius: 18, backgroundColor: '#ffffff0d', borderWidth: 1, borderColor: '#ffffff1f' },
	proTitle: { color: INK, fontSize: 16, fontWeight: '900' },
	proCopy: { color: '#c4ccd6', fontSize: 14, lineHeight: 20, marginTop: 4 },
	fine: { color: MUTED, fontSize: 13, lineHeight: 19, marginTop: 16 },
	done: { marginTop: 18, minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
	doneText: { fontWeight: '900', fontSize: 16 },
	putDown: { marginTop: 6, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
	putDownText: { color: MUTED, fontWeight: '800', fontSize: 15 },
});
