import { requireOptionalNativeModule } from 'expo';

export type Peer = { id: string; name: string };
export type LinkEvents = {
	onPeers: (event: { peers: Peer[] }) => void;
	/** `peer` names the connection; a doubles host has one per friend. */
	onConnected: (event: { initiator: boolean; peer: string }) => void;
	onMessage: (event: { text: string; peer: string }) => void;
	onClosed: (event: { reason: string; peer: string }) => void;
	onWaiting: (event: { denied: boolean; reason: string }) => void;
};
export type Link = {
	/** Advertises this phone as `name` and looks for others nearby. */
	start(name: string): void;
	/** Doubles (iOS only): the host advertises and takes up to three friends; everyone else looks for hosts. */
	startGroup?(name: string, host: boolean): void;
	connect(id: string): void;
	/** Sends to every connected phone. */
	send(text: string): void;
	sendTo?(peer: string, text: string): void;
	stop(): void;
	addListener<E extends keyof LinkEvents>(event: E, listener: LinkEvents[E]): { remove(): void };
};

/** The phone-to-phone link (modules/pickle-link). Missing in Expo Go, so rally mode hides itself there. */
export const link = requireOptionalNativeModule<Link>('PickleLink');
