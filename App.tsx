import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Platform, Pressable, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePaddleAudio } from './src/usePaddleAudio';
import { useSwingSession } from './src/useSwingSession';
import { useSettings } from './src/settings';
import { FocusStyles } from './src/FocusStyles';
import { DESIGNS, FINISHES, GUARD, PHOTO, Ball, Face, Sheen } from './src/PaddleArt';
import { INK, Menu, SENSITIVITY } from './src/Menu';
import { PACKS } from './src/sounds';
import { usePro } from './src/usePro';
import { useRally } from './src/useRally';
import { RallyHud, RallyLobby } from './src/RallyScreens';
import { photoUri, pickPaddlePhoto } from './src/photo';

const native = Platform.OS !== 'web';

export default function App() {
	return <SafeAreaProvider><FocusStyles /><StatusBar hidden /><PhonePaddle /></SafeAreaProvider>;
}

/** Follows the system Reduce Motion setting, so shakes and flashes can be skipped. */
function useReduceMotion() {
	const [reduce, setReduce] = useState(false);
	useEffect(() => {
		let mounted = true;
		AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduce(value); })
			.catch(cause => console.warn('Could not read Reduce Motion', cause));
		const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
		return () => { mounted = false; subscription.remove(); };
	}, []);
	return reduce;
}

/** True while the app is in the foreground. */
function useAppActive() {
	const [active, setActive] = useState(AppState.currentState === 'active');
	useEffect(() => {
		const subscription = AppState.addEventListener('change', state => setActive(state === 'active'));
		return () => subscription.remove();
	}, []);
	return active;
}

/** The phone is the paddle: the screen is the face, the handle runs into your hand. */
function PhonePaddle() {
	const dimensions = useWindowDimensions();
	const insets = useSafeAreaInsets();
	const width = Math.max(1, dimensions.width);
	const height = Math.max(1, dimensions.height);
	const { settings, update } = useSettings();
	const pro = usePro();
	// Pro choices stay saved but fall back to the free ones while Pro is locked.
	const unlocked = <T extends { pro?: boolean }>(item: T | undefined) => item && (!item.pro || pro.owned) ? item : undefined;
	const photo = settings.finish === PHOTO.name && pro.owned ? photoUri(settings.photo) : undefined;
	const finish = photo ? PHOTO : unlocked([...FINISHES, ...DESIGNS].find(option => option.name === settings.finish)) ?? FINISHES[0];
	const pack = unlocked(PACKS.find(option => option.id === settings.pack))?.id ?? 'classic';
	const reduceMotion = useReduceMotion();
	const appActive = useAppActive();
	const [menuOpen, setMenuOpen] = useState(false);
	const swing = useRef(new Animated.Value(0)).current;
	const tilt = useRef(new Animated.Value(0)).current;
	const impact = useRef(new Animated.Value(0)).current;
	const shake = useRef(new Animated.Value(0)).current;
	const audio = usePaddleAudio(pack);
	const rally = useRally(audio.cue, settings.swingBuzz);
	const onMotion = useCallback((value: number, side: number) => { swing.setValue(value); tilt.setValue(side); }, [swing, tilt]);
	const session = useSwingSession({ ...audio, onMotion, accept: rally.accept });
	const sweet = { x: width / 2, y: height * 0.4, r: Math.min(width, height) * 0.17 };

	useEffect(() => { session.setSensitivity(SENSITIVITY[settings.sensitivity]?.value ?? 0.5); }, [settings.sensitivity, session.setSensitivity]);
	const grab = useCallback(() => { if (!session.active) void session.start(); }, [session.active, session.start]);
	// Apps don't need a tap to unlock motion or sound, so the paddle is live whenever the app is open.
	// Leaving the app (or a permission prompt) stops the session; coming back starts it again.
	useEffect(() => { if (native && appActive && audio.ready) void session.start(); }, [appActive, audio.ready, session.start]);
	const openMenu = useCallback(() => setMenuOpen(true), []);
	const closeMenu = useCallback(() => setMenuOpen(false), []);
	const putDown = useCallback(() => { setMenuOpen(false); rally.leave(); session.stop(); }, [rally.leave, session.stop]);
	const choosePhoto = useCallback(() => {
		// iOS can't show the photo picker over the menu, so let the menu finish closing first.
		setMenuOpen(false);
		setTimeout(() => {
			pickPaddlePhoto(settings.photo).then(name => { if (name) update({ photo: name, finish: PHOTO.name }); })
				.catch(cause => console.warn('Could not use that photo', cause));
		}, 450);
	}, [settings.photo, update]);
	// Rally notices (like a friend leaving) fade on their own.
	useEffect(() => {
		if (!rally.notice) return;
		const timer = setTimeout(rally.clearNotice, 4000);
		return () => clearTimeout(timer);
	}, [rally.notice, rally.clearNotice]);

	useEffect(() => {
		const shot = session.shot;
		if (!shot) return;
		impact.stopAnimation();
		shake.stopAnimation();
		impact.setValue(1);
		const kick = reduceMotion ? 0 : 4 + shot.power * 14;
		const step = (toValue: number) => Animated.timing(shake, { toValue, duration: 28, useNativeDriver: native });
		Animated.parallel([
			Animated.timing(impact, { toValue: 0, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: native }),
			Animated.sequence([step(kick), step(-kick * 0.7), step(kick * 0.4), step(-kick * 0.2), step(0)]),
		]).start();
	}, [session.shot, impact, shake, reduceMotion]);

	// Desktop browsers have no motion sensor: Space pops, Shift+Space hits hard, E catches the edge.
	useEffect(() => {
		if (native || !session.active) return;
		const onKey = (event: KeyboardEvent) => {
			if (menuOpen) return;
			const key = event.key.toLowerCase();
			if (key === ' ' || key === 'enter') session.simulate(event.shiftKey ? 1700 : 760);
			else if (key === 'e') session.simulate(650, true);
			else return;
			event.preventDefault();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [session.active, session.simulate, menuOpen]);

	const shot = session.shot;
	// An edge hit lands near the rim instead of the sweet spot.
	const contact = shot?.mishit
		? { x: sweet.x + (shot.id % 2 ? 1 : -1) * width * 0.32, y: sweet.y - sweet.r * 0.7 }
		: { x: sweet.x, y: sweet.y };
	return <View style={[styles.root, { backgroundColor: GUARD }]}>
		<Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: shake }] }]}>
			<Face width={width} height={height} finish={finish} sweet={sweet} photo={photo} />
			{/* A sheen that slides as you tilt makes the face read as a real, glossy surface. */}
			<Animated.View pointerEvents="none" style={[styles.sheen, { width: width * 0.9, height: height * 1.4, left: width * 0.05, top: -height * 0.2,
				transform: [{ translateX: tilt.interpolate({ inputRange: [-1, 1], outputRange: [-width * 0.55, width * 0.55] }) }, { rotate: '18deg' }] }]}>
				<Sheen width={width * 0.9} height={height * 1.4} />
			</Animated.View>
			{/* Edge glow builds with swing speed, like a blade humming. */}
			<Animated.View pointerEvents="none" style={[styles.edgeGlow, { borderColor: finish.face, opacity: swing.interpolate({ inputRange: [0, 1], outputRange: [0, 0.9] }) }]} />
			{!reduceMotion && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#ffffff', opacity: impact.interpolate({ inputRange: [0, 1], outputRange: [0, 0.28] }) }]} />}
			<Animated.View pointerEvents="none" style={[styles.ring, {
				left: contact.x - sweet.r, top: contact.y - sweet.r, width: sweet.r * 2, height: sweet.r * 2, borderRadius: sweet.r,
				opacity: impact, transform: [{ scale: impact.interpolate({ inputRange: [0, 1], outputRange: [2.6, 0.9] }) }],
			}]} />
			{shot && <Animated.View pointerEvents="none" style={[styles.ball, {
				left: contact.x - sweet.r * 0.8, top: contact.y - sweet.r * 0.8,
				opacity: impact.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, 0.9, 1] }),
				transform: [{ scale: impact.interpolate({ inputRange: [0, 0.85, 1], outputRange: [0.35, 1, 1.25] }) }],
			}]}><Ball size={sweet.r * 1.6} /></Animated.View>}
		</Animated.View>

		{/* The iOS Simulator has no motion sensor, so development builds swing on a tap. */}
		{__DEV__ && native && session.active && <Pressable onPress={() => session.simulate(760)} style={StyleSheet.absoluteFill} accessibilityLabel="Swing (development builds only)" />}

		{rally.view.kind === 'playing' && <RallyHud view={rally.view} sweet={sweet} top={insets.top + 14} />}
		{rally.notice && rally.view.kind !== 'playing' && <View pointerEvents="none" style={[styles.toast, { top: insets.top + 14 }]}>
			<Text style={styles.toastText}>{rally.notice}</Text>
		</View>}

		{session.active && <Pressable onPress={openMenu} accessibilityRole="button" accessibilityLabel="Paddle settings" hitSlop={10}
			style={[styles.menuButton, { top: insets.top + 22, borderColor: finish.print }]}>
			<Text style={[styles.menuDots, { color: finish.print }]}>•••</Text>
		</Pressable>}

		{/* Browsers only allow motion and sound after a tap; apps show this only when something went wrong. */}
		{!session.active && (!native || audio.error || session.notice) && <Pressable onPress={grab} disabled={!audio.ready || session.starting} accessibilityRole="button"
			accessibilityLabel={native ? 'Try again' : 'Grab the paddle'} accessibilityHint="Then swing your phone like a paddle" style={styles.grab}>
			<View style={styles.grabCard}>
				<Text style={styles.grabTitle}>{audio.error ? 'Sound couldn’t load' : !audio.ready || session.starting ? 'Warming up…' : 'Your phone is the paddle'}</Text>
				<Text style={styles.grabCopy}>Grip the bottom like a handle and swing away.</Text>
				{(audio.error || session.notice) && <Text style={styles.grabNotice}>{audio.error ?? session.notice}</Text>}
				<View style={[styles.grabButton, { backgroundColor: finish.face }]}><Text style={[styles.grabButtonText, { color: finish.print }]}>{native ? 'Try again' : 'Grab the paddle'}</Text></View>
				<Pressable onPress={openMenu} accessibilityRole="button" style={styles.grabSettings}><Text style={styles.grabSettingsText}>Settings</Text></Pressable>
			</View>
		</Pressable>}

		<Menu visible={menuOpen} onClose={closeMenu} onPutDown={native ? undefined : putDown}
			finish={finish} onFinish={option => update({ finish: option.name })}
			photo={settings.photo} onPickPhoto={choosePhoto}
			pack={pack} onPack={choice => update({ pack: choice })} onPreview={audio.preview}
			sensitivity={settings.sensitivity} onSensitivity={sensitivity => update({ sensitivity })}
			pro={pro}
			rally={rally.available ? { playing: rally.view.kind === 'playing', onFind: rally.find, onLeave: rally.leave,
				buzz: settings.swingBuzz, onBuzz: swingBuzz => update({ swingBuzz }) } : undefined} />
		{rally.view.kind === 'lobby' && <RallyLobby view={rally.view} finish={finish} onJoin={rally.join} onCancel={rally.leave} />}
	</View>;
}

const styles = StyleSheet.create({
	root: { flex: 1, overflow: 'hidden' },
	sheen: { position: 'absolute' },
	edgeGlow: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderWidth: 6, borderRadius: 40 },
	ring: { position: 'absolute', borderWidth: 5, borderColor: '#ffffff' },
	ball: { position: 'absolute' },
	menuButton: { position: 'absolute', right: 30, width: 44, height: 32, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', opacity: 0.5 },
	menuDots: { fontSize: 12, fontWeight: '900', letterSpacing: 1 },
	toast: { position: 'absolute', left: 16, right: 92, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, backgroundColor: '#05080dc4' },
	toastText: { color: INK, fontSize: 15, fontWeight: '800' },
	grab: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#05080dcc', alignItems: 'center', justifyContent: 'center', padding: 24 },
	grabCard: { width: '100%', maxWidth: 360, alignItems: 'center' },
	grabTitle: { color: INK, fontSize: 30, fontWeight: '900', letterSpacing: -1, textAlign: 'center' },
	grabCopy: { color: '#c4ccd6', fontSize: 16, lineHeight: 23, textAlign: 'center', marginTop: 12 },
	grabNotice: { color: '#ffb7a8', fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 12 },
	grabButton: { marginTop: 28, minHeight: 56, paddingHorizontal: 32, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
	grabButtonText: { fontSize: 18, fontWeight: '900' },
	grabSettings: { marginTop: 10, minHeight: 44, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
	grabSettingsText: { color: '#c4ccd6', fontSize: 15, fontWeight: '800' },
});
