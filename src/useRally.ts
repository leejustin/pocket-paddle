import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { link } from './link';
import type { Peer } from './link';
import { PROTOCOL, canHit, newRally, parseMessage, receive, swing, tick } from './rally';
import type { Effect, Message, Rally } from './rally';
import { buzz, pointFeel } from './feel';
import type { Shot } from './motion';
import type { Cue } from './sounds';

export type RallyView =
	| { kind: 'off' }
	| { kind: 'lobby'; name: string; peers: Peer[]; joining?: string; problem?: string }
	| { kind: 'playing'; friend: string; rally: Rally; swingNow: boolean };

const TICK = 16;
const PING = 2000;


/**
 * Opt-in two-phone rally. `cue` plays the bounce and dead-ball sounds; `haptics` turns the swing buzzes on.
 * `available` is false in Expo Go and on the web, where there's no phone-to-phone link.
 */
export function useRally(cue: (name: Cue) => void, haptics: boolean) {
	const [view, setView] = useState<RallyView>({ kind: 'off' });
	const [notice, setNotice] = useState<string>();
	const viewRef = useRef(view);
	viewRef.current = view;
	const rally = useRef<Rally | undefined>(undefined);
	const swingNow = useRef(false);
	const friend = useRef('Your friend');
	const cueRef = useRef(cue);
	cueRef.current = cue;
	const hapticsRef = useRef(haptics);
	hapticsRef.current = haptics;

	const show = useCallback(() => {
		if (rally.current) setView({ kind: 'playing', friend: friend.current, rally: rally.current, swingNow: swingNow.current });
	}, []);
	const send = useCallback((message: Message) => link?.send(JSON.stringify(message)), []);
	const apply = useCallback((step: { rally: Rally; effects: Effect[] }) => {
		const changed = step.rally !== rally.current;
		rally.current = step.rally;
		for (const effect of step.effects) {
			if (effect.kind === 'send') send(effect.message);
			else if (effect.kind === 'sound') cueRef.current(effect.name);
			else if (effect.kind === 'buzz') { if (hapticsRef.current) buzz(effect.name); }
			else pointFeel(effect.won);
		}
		if (changed) show();
	}, [send, show]);
	const end = useCallback((message?: string) => {
		link?.stop();
		rally.current = undefined;
		swingNow.current = false;
		setView({ kind: 'off' });
		setNotice(message);
	}, []);

	useEffect(() => {
		if (!link) return;
		const subscriptions = [
			link.addListener('onPeers', ({ peers }) => {
				setView(current => current.kind === 'lobby' ? { ...current, peers, problem: undefined } : current);
			}),
			link.addListener('onWaiting', ({ denied }) => {
				setView(current => current.kind === 'lobby' ? {
					...current,
					problem: denied ? 'Turn on Local Network for Pocket Pickle in Settings to find nearby phones.' : 'Waiting for Wi-Fi…',
				} : current);
			}),
			link.addListener('onConnected', ({ initiator }) => {
				// Doubles uses the same link; only a one-on-one lobby turns a connection into a rally.
				if (viewRef.current.kind !== 'lobby') return;
				const name = viewRef.current.kind === 'lobby' ? viewRef.current.name : 'Paddle';
				friend.current = 'Your friend';
				// Whoever tapped to join serves first.
				rally.current = newRally(initiator);
				swingNow.current = false;
				send({ t: 'hello', v: PROTOCOL, name });
				show();
			}),
			link.addListener('onMessage', ({ text }) => {
				const message = parseMessage(text);
				if (!message || !rally.current) return;
				if (message.t === 'hello') {
					if (message.v !== PROTOCOL) return end('Update Pocket Pickle on both phones to rally.');
					friend.current = message.name;
					return show();
				}
				apply(receive(rally.current, message, performance.now()));
			}),
			link.addListener('onClosed', ({ reason }) => {
				if (rally.current) return end(reason);
				setView(current => current.kind === 'lobby' ? { ...current, joining: undefined, problem: reason } : current);
			}),
		];
		return () => subscriptions.forEach(subscription => subscription.remove());
	}, [apply, end, send, show]);

	const playing = view.kind === 'playing';
	useEffect(() => {
		if (!playing) return;
		const timer = setInterval(() => {
			if (!rally.current) return;
			const now = performance.now();
			const ready = canHit(rally.current, now);
			const step = tick(rally.current, now);
			if (ready !== swingNow.current) {
				swingNow.current = ready;
				if (step.rally === rally.current) show();
			}
			apply(step);
		}, TICK);
		const pinger = setInterval(() => send({ t: 'ping', at: performance.now() }), PING);
		send({ t: 'ping', at: performance.now() });
		return () => { clearInterval(timer); clearInterval(pinger); };
	}, [playing, apply, send, show]);

	// The other phone can't see you leave the app, so end the rally cleanly instead of going quiet.
	useEffect(() => {
		const subscription = AppState.addEventListener('change', state => {
			if (state === 'background' && viewRef.current.kind !== 'off') end(viewRef.current.kind === 'playing' ? 'The rally ended when you left the app.' : undefined);
		});
		return () => subscription.remove();
	}, [end]);
	useEffect(() => () => link?.stop(), []);

	const find = useCallback(() => {
		if (!link) return;
		const name = `Paddle ${Math.floor(1000 + Math.random() * 9000)}`;
		setNotice(undefined);
		setView({ kind: 'lobby', name, peers: [] });
		link.start(name);
	}, []);
	const join = useCallback((peer: Peer) => {
		setView(current => current.kind === 'lobby' ? { ...current, joining: peer.id, problem: undefined } : current);
		link?.connect(peer.id);
	}, []);
	const leave = useCallback(() => end(), [end]);
	/** Judges a local swing. Outside a rally every swing pops; inside one, only swings that meet the ball do. */
	const accept = useCallback((shot: Shot) => {
		if (!rally.current) return true;
		const step = swing(rally.current, shot, performance.now());
		apply(step);
		return step.played;
	}, [apply]);
	const clearNotice = useCallback(() => setNotice(undefined), []);

	return { available: link != null, view, notice, clearNotice, find, join, leave, accept };
}
