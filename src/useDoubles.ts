import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { link } from './link';
import type { Peer } from './link';
import { DOUBLES, HOST, newSeat, parseGuestMessage, parseHostMessage, refereeSwing, refereeTick, seatCanHit, seatReceive, seatSwing, seatTick, startGame } from './doubles';
import type { GuestMessage, HostMessage, Out, Player, Referee, Seat, SeatEffect } from './doubles';
import { MAX_LATENCY, clamp } from './rally';
import { buzz, pointFeel } from './feel';
import type { Shot } from './motion';
import type { Cue } from './sounds';

/** A friend in the host's lobby. Exactly one of them is the host's partner. */
export type Guest = { id: string; name: string; partner: boolean };
export type DoublesView =
	| { kind: 'off' }
	| { kind: 'hosting'; name: string; guests: Guest[]; problem?: string }
	| { kind: 'joining'; name: string; hosts: Peer[]; joining?: string; roster?: Player[]; me?: string; problem?: string }
	| { kind: 'playing'; seat: Seat; swingNow: boolean };

const TICK = 16;
const PING = 2000;
const randomName = () => `Paddle ${Math.floor(1000 + Math.random() * 9000)}`;

/**
 * Four-phone doubles over the same link as one-on-one rallies (iOS only). The host runs the referee
 * in `doubles.ts` and relays its calls; everyone, the host included, plays from their own seat.
 */
export function useDoubles(cue: (name: Cue) => void, haptics: boolean) {
	const available = typeof link?.startGroup === 'function' && typeof link?.sendTo === 'function';
	const [view, setView] = useState<DoublesView>({ kind: 'off' });
	const [notice, setNotice] = useState<string>();
	const viewRef = useRef(view);
	viewRef.current = view;
	const role = useRef<'host' | 'guest' | undefined>(undefined);
	const myName = useRef('');
	const referee = useRef<Referee | undefined>(undefined);
	const seat = useRef<Seat | undefined>(undefined);
	const swingNow = useRef(false);
	/** Host: friends who said hello, and one-way delay to each. Guest: the connection to the host. */
	const guests = useRef<Guest[]>([]);
	const latency = useRef(new Map<string, number>());
	const hostPeer = useRef<string | undefined>(undefined);
	const cueRef = useRef(cue);
	cueRef.current = cue;
	const hapticsRef = useRef(haptics);
	hapticsRef.current = haptics;

	const show = useCallback(() => {
		if (seat.current && viewRef.current.kind === 'playing') setView({ kind: 'playing', seat: seat.current, swingNow: swingNow.current });
	}, []);
	const toHost = useCallback((message: GuestMessage) => {
		if (hostPeer.current) link?.sendTo?.(hostPeer.current, JSON.stringify(message));
	}, []);
	const applySeat = useCallback((step: { seat: Seat; effects: SeatEffect[] }) => {
		const changed = step.seat !== seat.current;
		seat.current = step.seat;
		for (const effect of step.effects) {
			if (effect.kind === 'send') toHost(effect.message);
			else if (effect.kind === 'sound') cueRef.current(effect.name);
			else if (effect.kind === 'buzz') { if (hapticsRef.current) buzz(effect.name); }
			else pointFeel(effect.won);
		}
		if (changed) show();
	}, [show, toHost]);
	/** Host: carries out the referee's calls, on this phone's own seat and over the link. */
	const emit = useCallback((out: Out[]) => {
		for (const { to, message } of out) {
			if (!to || to === HOST) applySeat(seatReceive(seat.current ?? newSeat(HOST), message, performance.now()));
			if (!to) link?.send(JSON.stringify(message));
			else if (to !== HOST) link?.sendTo?.(to, JSON.stringify(message));
		}
	}, [applySeat]);

	const end = useCallback((message?: string) => {
		link?.stop();
		role.current = undefined;
		referee.current = undefined;
		seat.current = undefined;
		swingNow.current = false;
		guests.current = [];
		latency.current.clear();
		hostPeer.current = undefined;
		setView({ kind: 'off' });
		setNotice(message);
	}, []);

	/** Host: everyone in the lobby, in teams: the host and their partner against the other two. */
	const lobbyPlayers = useCallback((): Player[] => [
		{ id: HOST, name: myName.current, team: 0 },
		...guests.current.map(guest => ({ id: guest.id, name: guest.name, team: guest.partner ? 0 as const : 1 as const })),
	], []);
	const shareLobby = useCallback(() => {
		const players = lobbyPlayers();
		for (const guest of guests.current) {
			const roster: HostMessage = { t: 'roster', v: DOUBLES, you: guest.id, players };
			link?.sendTo?.(guest.id, JSON.stringify(roster));
		}
		setView(current => current.kind === 'hosting' ? { ...current, guests: [...guests.current] } : current);
	}, [lobbyPlayers]);

	useEffect(() => {
		if (!link) return;
		const subscriptions = [
			link.addListener('onPeers', ({ peers }) => {
				if (role.current !== 'guest') return;
				setView(current => current.kind === 'joining' ? { ...current, hosts: peers, problem: undefined } : current);
			}),
			link.addListener('onWaiting', ({ denied }) => {
				if (role.current !== 'guest') return;
				setView(current => current.kind === 'joining' ? {
					...current,
					problem: denied ? 'Turn on Local Network for Pocket Pickle in Settings to find nearby phones.' : 'Waiting for Wi-Fi…',
				} : current);
			}),
			link.addListener('onConnected', ({ initiator, peer }) => {
				if (role.current === 'guest' && initiator) {
					hostPeer.current = peer;
					toHost({ t: 'hello', v: DOUBLES, name: myName.current });
				}
				// The host waits for a friend's hello before listing them.
			}),
			link.addListener('onMessage', ({ text, peer }) => {
				const now = performance.now();
				if (role.current === 'host') {
					const message = parseGuestMessage(text);
					if (!message) return;
					if (message.t === 'hello') {
						if (message.v !== DOUBLES || referee.current || guests.current.some(guest => guest.id === peer)) return;
						guests.current = [...guests.current, { id: peer, name: message.name, partner: !guests.current.some(guest => guest.partner) }];
						return shareLobby();
					}
					if (message.t === 'swing') {
						if (!referee.current) return;
						const step = refereeSwing(referee.current, peer, message, now - (latency.current.get(peer) ?? 0), now);
						referee.current = step.referee;
						return emit(step.out);
					}
					if (message.t === 'ping') return link?.sendTo?.(peer, JSON.stringify({ t: 'pong', at: message.at }));
					const oneWay = clamp((now - message.at) / 2, 0, MAX_LATENCY);
					const before = latency.current.get(peer);
					latency.current.set(peer, before === undefined ? oneWay : before * 0.7 + oneWay * 0.3);
					return;
				}
				if (role.current !== 'guest' || peer !== hostPeer.current) return;
				const message = parseHostMessage(text);
				if (!message) return;
				if (message.t === 'roster') {
					if (message.v !== DOUBLES) return end('Update Pocket Pickle on every phone to play doubles.');
					seat.current = seatReceive(seat.current ?? newSeat(message.you), message, now).seat;
					setView(current => current.kind === 'joining' ? { ...current, joining: undefined, roster: message.players, me: message.you } : current);
					return;
				}
				if (!seat.current) return;
				// The first serve starts the game.
				if (message.t === 'serve' && viewRef.current.kind === 'joining') {
					viewRef.current = { kind: 'playing', seat: seat.current, swingNow: false };
					setView(viewRef.current);
				}
				applySeat(seatReceive(seat.current, message, now));
			}),
			link.addListener('onClosed', ({ reason, peer }) => {
				const current = viewRef.current;
				if (role.current === 'host') {
					const left = guests.current.find(guest => guest.id === peer);
					if (current.kind === 'playing' || !peer) return end(left ? `${left.name} left, so the game ended.` : reason);
					if (!left) return;
					guests.current = guests.current.filter(guest => guest.id !== peer);
					if (left.partner && guests.current[0]) guests.current = guests.current.map((guest, index) => ({ ...guest, partner: index === 0 }));
					return shareLobby();
				}
				if (role.current !== 'guest') return;
				if (current.kind === 'playing') return end('The game ended. Someone left or the host stopped it.');
				if (peer && peer === hostPeer.current) {
					hostPeer.current = undefined;
					seat.current = undefined;
					const wasIn = current.kind === 'joining' && current.roster != null;
					setView(view => view.kind === 'joining' ? { ...view, joining: undefined, roster: undefined, me: undefined,
						problem: wasIn ? 'The host closed the game.' : 'Couldn’t join that game. It may be full.' } : view);
					// Look for games again.
					link?.startGroup?.(myName.current, false);
				} else if (current.kind === 'joining') {
					setView(view => view.kind === 'joining' ? { ...view, joining: undefined, problem: reason } : view);
				}
			}),
		];
		return () => subscriptions.forEach(subscription => subscription.remove());
	}, [applySeat, emit, end, shareLobby, toHost]);

	const playing = view.kind === 'playing';
	useEffect(() => {
		if (!playing) return;
		const timer = setInterval(() => {
			const now = performance.now();
			if (referee.current) {
				const step = refereeTick(referee.current, now);
				referee.current = step.referee;
				if (step.out.length) emit(step.out);
			}
			if (!seat.current) return;
			const ready = seatCanHit(seat.current, now);
			const step = seatTick(seat.current, now);
			if (ready !== swingNow.current) {
				swingNow.current = ready;
				if (step.seat === seat.current) show();
			}
			applySeat(step);
		}, TICK);
		const ping = () => {
			const at = performance.now();
			if (role.current === 'host') link?.send(JSON.stringify({ t: 'ping', at }));
			else toHost({ t: 'ping', at });
		};
		const pinger = setInterval(ping, PING);
		ping();
		return () => { clearInterval(timer); clearInterval(pinger); };
	}, [playing, applySeat, emit, show, toHost]);

	// The others can't see you leave the app, so end the game cleanly instead of going quiet.
	useEffect(() => {
		const subscription = AppState.addEventListener('change', state => {
			if (state === 'background' && viewRef.current.kind !== 'off') end(viewRef.current.kind === 'playing' ? 'The game ended when you left the app.' : undefined);
		});
		return () => subscription.remove();
	}, [end]);
	useEffect(() => () => { if (role.current) link?.stop(); }, []);

	const host = useCallback(() => {
		if (!available) return;
		role.current = 'host';
		myName.current = randomName();
		guests.current = [];
		setNotice(undefined);
		setView({ kind: 'hosting', name: myName.current, guests: [] });
		link?.startGroup?.(myName.current, true);
	}, [available]);
	const join = useCallback(() => {
		if (!available) return;
		role.current = 'guest';
		myName.current = randomName();
		setNotice(undefined);
		setView({ kind: 'joining', name: myName.current, hosts: [] });
		link?.startGroup?.(myName.current, false);
	}, [available]);
	const choose = useCallback((peer: Peer) => {
		setView(current => current.kind === 'joining' ? { ...current, joining: peer.id, problem: undefined } : current);
		link?.connect(peer.id);
	}, []);
	const partner = useCallback((id: string) => {
		guests.current = guests.current.map(guest => ({ ...guest, partner: guest.id === id }));
		shareLobby();
	}, [shareLobby]);
	const start = useCallback(() => {
		if (role.current !== 'host' || guests.current.length !== 3) return;
		const game = startGame(lobbyPlayers());
		referee.current = game.referee;
		seat.current = newSeat(HOST);
		viewRef.current = { kind: 'playing', seat: seat.current, swingNow: false };
		setView(viewRef.current);
		emit(game.out);
	}, [emit, lobbyPlayers]);
	const leave = useCallback(() => { if (role.current) end(); }, [end]);
	/** Judges a local swing during a game; outside one, every swing pops. */
	const accept = useCallback((shot: Shot) => {
		if (!seat.current || viewRef.current.kind !== 'playing') return true;
		const step = seatSwing(seat.current, shot);
		seat.current = step.seat;
		if (step.send?.t === 'swing') {
			if (role.current === 'host' && referee.current) {
				const now = performance.now();
				const result = refereeSwing(referee.current, HOST, step.send, shot.time, now);
				referee.current = result.referee;
				emit(result.out);
			} else toHost(step.send);
		}
		show();
		return step.played;
	}, [emit, show, toHost]);
	const clearNotice = useCallback(() => setNotice(undefined), []);

	return { available, view, notice, clearNotice, host, join, choose, partner, start, leave, accept };
}
