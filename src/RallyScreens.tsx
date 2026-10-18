import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ball } from './PaddleArt';
import type { Finish } from './PaddleArt';
import { INK } from './Menu';
import type { Peer } from './link';
import type { RallyView } from './useRally';
import type { DoublesView } from './useDoubles';

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

/** The ball in flight: coming at this phone, heading away, or neither. */
export type BallPhase = { kind: 'incoming'; launched: number; arrival: number } | { kind: 'away'; launched: number; flight: number } | { kind: 'none' };
type HudProps = { phase: BallPhase; status: string; score: string; swingNow: boolean; sweet: { x: number; y: number; r: number }; top: number };

/** The scoreboard and the ball in flight, drawn over the paddle during a rally or a doubles game. */
export function RallyHud({ phase, status, score, swingNow, sweet, top }: HudProps) {
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
	return <>
		{(phase.kind === 'incoming' || phase.kind === 'away') && <Animated.View pointerEvents="none" style={[styles.ball, {
			left: sweet.x - size / 2, top: sweet.y - size / 2,
			opacity: flight.interpolate({ inputRange: [0, 0.08, 1], outputRange: [0, 1, 1] }),
			transform: [{ scale: flight.interpolate({ inputRange: [0, 1], outputRange: [0.08, 1] }) }],
		}]}><Ball size={size} /></Animated.View>}
		{swingNow && <View pointerEvents="none" style={[styles.window, { left: sweet.x - sweet.r * 1.15, top: sweet.y - sweet.r * 1.15, width: sweet.r * 2.3, height: sweet.r * 2.3, borderRadius: sweet.r * 1.15 }]} />}
		<View pointerEvents="none" style={[styles.board, { top }]} accessibilityLiveRegion="polite">
			<Text style={styles.status}>{status}</Text>
			<Text style={styles.score}>{score}</Text>
		</View>
	</>;
}

/** Picks out the ball for the HUD from a rally or doubles phase. */
export function ballOf(phase: { kind: string; launched?: number; arrival?: number; flight?: number }): BallPhase {
	if (phase.kind === 'incoming' && phase.launched != null && phase.arrival != null) return { kind: 'incoming', launched: phase.launched, arrival: phase.arrival };
	if (phase.kind === 'away' && phase.launched != null && phase.flight != null) return { kind: 'away', launched: phase.launched, flight: phase.flight };
	return { kind: 'none' };
}

export function rallyScore({ rally, friend }: Extract<RallyView, { kind: 'playing' }>) {
	return `You ${rally.me} · ${rally.them} ${friend}${rally.best > 1 ? `  ·  Best rally ${rally.best}` : ''}`;
}

export function rallyStatus({ rally, friend, swingNow }: Extract<RallyView, { kind: 'playing' }>) {
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

type DoublesLobbyProps = {
	view: Extract<DoublesView, { kind: 'hosting' | 'joining' }>; finish: Finish;
	onChoose: (peer: Peer) => void; onPartner: (id: string) => void; onStart: () => void; onCancel: () => void;
};

/** Doubles: the host gathers three friends and picks a partner; friends find the host's game and wait for the start. */
export function DoublesLobby({ view, finish, onChoose, onPartner, onStart, onCancel }: DoublesLobbyProps) {
	return <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
		<View style={styles.backdrop}><View accessibilityViewIsModal style={styles.sheet}><ScrollView contentContainerStyle={styles.content}>
			{view.kind === 'hosting' ? <>
				<Text accessibilityRole="header" style={styles.title}>Host doubles</Text>
				<Text style={styles.body}>Three friends open ••• → Join doubles and tap your game. Pick your partner, then start. Same Wi-Fi, or iPhones close together.</Text>
				<Text style={styles.label}>Your game</Text>
				<Text style={styles.me}>{view.name}</Text>
				<Text style={styles.label}>Players · {view.guests.length + 1} of 4</Text>
				<View style={styles.peer}><Text style={styles.peerName}>You</Text><Text style={styles.team}>Your team</Text></View>
				{view.guests.map(guest => <View key={guest.id} style={styles.peer}>
					<Text style={styles.peerName}>{guest.name}</Text>
					<Pressable onPress={() => onPartner(guest.id)} disabled={guest.partner} accessibilityRole="radio" accessibilityState={{ selected: guest.partner }}
						accessibilityLabel={`${guest.name}: ${guest.partner ? 'your partner' : 'make your partner'}`}
						style={[styles.join, guest.partner ? { backgroundColor: finish.face } : styles.joinOutline]}>
						<Text style={[styles.joinText, { color: guest.partner ? finish.print : INK }]}>{guest.partner ? 'Partner' : 'Opponent'}</Text>
					</Pressable>
				</View>)}
				{view.guests.length < 3 && <View style={styles.searching}>
					<ActivityIndicator color={MUTED} />
					<Text style={styles.searchingText}>Waiting for {3 - view.guests.length} more…</Text>
				</View>}
				{view.guests.length === 3 && <Text style={styles.fine}>Tap Opponent to switch partners.</Text>}
				{view.problem && <Text style={styles.problem}>{view.problem}</Text>}
				<Pressable onPress={onStart} disabled={view.guests.length < 3} accessibilityRole="button" accessibilityState={{ disabled: view.guests.length < 3 }}
					style={[styles.start, { backgroundColor: finish.face, opacity: view.guests.length < 3 ? 0.4 : 1 }]}>
					<Text style={[styles.startText, { color: finish.print }]}>Start the game</Text>
				</Pressable>
			</> : <>
				<Text accessibilityRole="header" style={styles.title}>Join doubles</Text>
				<Text style={styles.body}>Joining is free. A friend with Pro hosts, and their game shows up here. Same Wi-Fi, or iPhones close together.</Text>
				<Text style={styles.label}>This phone</Text>
				<Text style={styles.me}>{view.name}</Text>
				{view.roster ? <>
					<Text style={styles.label}>You’re in</Text>
					<Text style={styles.body}>Your team: {teamNames(view, true)}</Text>
					<Text style={styles.body}>Them: {teamNames(view, false)}</Text>
					<View style={styles.searching}>
						<ActivityIndicator color={MUTED} />
						<Text style={styles.searchingText}>{view.roster.length < 4 ? `Waiting for ${4 - view.roster.length} more…` : 'Waiting for the host to start…'}</Text>
					</View>
				</> : <>
					<Text style={styles.label}>Games nearby</Text>
					{view.hosts.length === 0 && <View style={styles.searching}>
						<ActivityIndicator color={MUTED} />
						<Text style={styles.searchingText}>Looking for doubles games…</Text>
					</View>}
					{view.hosts.map(peer => <Pressable key={peer.id} onPress={() => onChoose(peer)} disabled={view.joining != null}
						accessibilityRole="button" accessibilityLabel={`Join ${peer.name}`} style={styles.peer}>
						<Text style={styles.peerName}>{peer.name}</Text>
						<View style={[styles.join, { backgroundColor: finish.face }]}>
							{view.joining === peer.id
								? <ActivityIndicator color={finish.print} />
								: <Text style={[styles.joinText, { color: finish.print }]}>Join</Text>}
						</View>
					</Pressable>)}
				</>}
				{view.problem && <Text style={styles.problem}>{view.problem}</Text>}
			</>}
			<Text style={styles.fine}>Nothing goes over the internet. The phones talk to each other directly, and only while you play.</Text>
			<Pressable onPress={onCancel} accessibilityRole="button" style={styles.cancel}><Text style={styles.cancelText}>{view.kind === 'hosting' ? 'Cancel' : 'Leave'}</Text></Pressable>
		</ScrollView></View></View>
	</Modal>;
}

function teamNames(view: Extract<DoublesView, { kind: 'joining' }>, mine: boolean) {
	const me = view.roster?.find(player => player.id === view.me);
	const names = (view.roster ?? []).filter(player => (player.team === me?.team) === mine)
		.map(player => player.id === view.me ? 'You' : player.name);
	return names.length ? names.join(' & ') : 'waiting…';
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
	joinOutline: { borderWidth: 1.5, borderColor: '#ffffff33' },
	team: { color: MUTED, fontSize: 14, fontWeight: '800' },
	start: { marginTop: 18, minHeight: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
	startText: { fontSize: 17, fontWeight: '900' },
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
