import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ball } from './PaddleArt';
import type { Finish } from './PaddleArt';
import { INK } from './Menu';
import type { Peer } from './link';
import type { RallyView } from './useRally';

const MUTED = '#8fa0b3';
const native = Platform.OS !== 'web';

type LobbyProps = { view: Extract<RallyView, { kind: 'lobby' }>; finish: Finish; onJoin: (peer: Peer) => void; onCancel: () => void };

/** Both phones open this; each lists the other, and either one taps to start. */
export function RallyLobby({ view, finish, onJoin, onCancel }: LobbyProps) {
	return <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
		<View style={styles.backdrop}><View accessibilityViewIsModal style={styles.sheet}><ScrollView contentContainerStyle={styles.content}>
			<Text accessibilityRole="header" style={styles.title}>Rally with a friend</Text>
			<Text style={styles.body}>Open this on both phones. Connect over the same Wi-Fi, or directly between two iPhones.</Text>
			<Text style={styles.label}>This phone</Text>
			<Text style={styles.me}>{view.name}</Text>
			<Text style={styles.label}>Nearby</Text>
			{view.peers.length === 0 && <View style={styles.searching}>
				<ActivityIndicator color={MUTED} />
				<Text style={styles.searchingText}>Looking for paddles nearby…</Text>
			</View>}
			{view.peers.map(peer => <Pressable key={peer.id} onPress={() => onJoin(peer)} disabled={view.joining != null}
				accessibilityRole="button" accessibilityLabel={`Rally with ${peer.name}`} style={styles.peer}>
				<Text style={styles.peerName}>{peer.name}</Text>
				<View style={[styles.join, { backgroundColor: finish.face }]}>
					{view.joining === peer.id
						? <ActivityIndicator color={finish.print} />
						: <Text style={[styles.joinText, { color: finish.print }]}>Rally</Text>}
				</View>
			</Pressable>)}
			{view.problem && <Text style={styles.problem}>{view.problem}</Text>}
			<Text style={styles.fine}>Nothing goes over the internet. The phones talk to each other directly, and only while you rally.</Text>
			<Pressable onPress={onCancel} accessibilityRole="button" style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable>
		</ScrollView></View></View>
	</Modal>;
}

type HudProps = { view: Extract<RallyView, { kind: 'playing' }>; sweet: { x: number; y: number; r: number }; top: number };

/** The scoreboard and the ball in flight, drawn over the paddle during a rally. */
export function RallyHud({ view, sweet, top }: HudProps) {
	const { rally, friend, swingNow } = view;
	const { phase } = rally;
	const flight = useRef(new Animated.Value(0)).current;
	const key = phase.kind === 'incoming' ? `in-${phase.launched}` : phase.kind === 'away' ? `out-${phase.launched}` : phase.kind;
	useEffect(() => {
		flight.stopAnimation();
		// The ball grows as it comes at you and shrinks as it flies to the other phone.
		if (phase.kind === 'incoming') {
			flight.setValue(0);
			Animated.timing(flight, { toValue: 1, duration: Math.max(0, phase.arrival - performance.now()), easing: Easing.in(Easing.quad), useNativeDriver: native }).start();
		} else if (phase.kind === 'away') {
			flight.setValue(1);
			Animated.timing(flight, { toValue: 0, duration: phase.flight, easing: Easing.out(Easing.quad), useNativeDriver: native }).start();
		} else {
			flight.setValue(0);
		}
	}, [key]);
	const size = sweet.r * 1.6;
	const status = statusFor(view);
	return <>
		{(phase.kind === 'incoming' || phase.kind === 'away') && <Animated.View pointerEvents="none" style={[styles.ball, {
			left: sweet.x - size / 2, top: sweet.y - size / 2,
			opacity: flight.interpolate({ inputRange: [0, 0.08, 1], outputRange: [0, 1, 1] }),
			transform: [{ scale: flight.interpolate({ inputRange: [0, 1], outputRange: [0.08, 1] }) }],
		}]}><Ball size={size} /></Animated.View>}
		{swingNow && <View pointerEvents="none" style={[styles.window, { left: sweet.x - sweet.r * 1.15, top: sweet.y - sweet.r * 1.15, width: sweet.r * 2.3, height: sweet.r * 2.3, borderRadius: sweet.r * 1.15 }]} />}
		<View pointerEvents="none" style={[styles.board, { top }]} accessibilityLiveRegion="polite">
			<Text style={styles.status}>{status}</Text>
			<Text style={styles.score}>You {rally.me} · {rally.them} {friend}{rally.best > 1 ? `  ·  Best rally ${rally.best}` : ''}</Text>
		</View>
	</>;
}

function statusFor({ rally, friend, swingNow }: Extract<RallyView, { kind: 'playing' }>) {
	const { phase } = rally;
	switch (phase.kind) {
		case 'serve': return phase.mine ? 'Your serve. Swing!' : `${friend} serves`;
		case 'away': return rally.count === 1 ? 'Served' : `Rally ${rally.count}`;
		case 'incoming': return swingNow ? 'Swing!' : `Rally ${rally.count}`;
		case 'point':
			if (phase.won) return phase.why === 'out' ? 'Your point. Their shot went out' : 'Your point. They missed';
			return phase.why === 'out' ? 'Out! Caught the edge' : 'Missed it';
	}
}

const styles = StyleSheet.create({
	backdrop: { flex: 1, backgroundColor: '#000000b0', justifyContent: 'center', alignItems: 'center', padding: 16 },
	sheet: { width: '100%', maxWidth: 420, maxHeight: '92%', borderRadius: 24, backgroundColor: '#111722', borderWidth: 1, borderColor: '#ffffff1a' },
	content: { padding: 22 },
	title: { color: INK, fontSize: 24, fontWeight: '900', letterSpacing: -0.8 },
	body: { color: '#c4ccd6', fontSize: 15, lineHeight: 21, marginTop: 10 },
	label: { color: MUTED, fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 18, marginBottom: 8 },
	me: { color: INK, fontSize: 18, fontWeight: '800' },
	searching: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
	searchingText: { color: '#c4ccd6', fontSize: 15 },
	peer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56, paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#ffffff14' },
	peerName: { color: INK, fontSize: 17, fontWeight: '800', flexShrink: 1 },
	join: { minWidth: 88, minHeight: 40, paddingHorizontal: 18, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
	joinText: { fontWeight: '900', fontSize: 15 },
	problem: { color: '#ffb7a8', fontSize: 14, lineHeight: 20, marginTop: 12 },
	fine: { color: MUTED, fontSize: 13, lineHeight: 19, marginTop: 18 },
	cancel: { marginTop: 10, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
	cancelText: { color: MUTED, fontWeight: '800', fontSize: 15 },
	ball: { position: 'absolute' },
	window: { position: 'absolute', borderWidth: 4, borderColor: '#ffffff', opacity: 0.85 },
	board: { position: 'absolute', left: 16, right: 92, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, backgroundColor: '#05080dc4' },
	status: { color: INK, fontSize: 20, fontWeight: '900', letterSpacing: -0.4 },
	score: { color: '#c4ccd6', fontSize: 13, fontWeight: '700', marginTop: 2 },
});
