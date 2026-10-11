import { requireOptionalNativeModule } from 'expo';

export type Peer = { id: string; name: string };
export type LinkEvents = {
	onPeers: (event: { peers: Peer[] }) => void;
	onConnected: (event: { initiator: boolean }) => void;
	onMessage: (event: { text: string }) => void;
	onClosed: (event: { reason: string }) => void;
	onWaiting: (event: { denied: boolean; reason: string }) => void;
};
export type Link = {
	/** Advertises this phone as `name` and looks for others nearby. */
	start(name: string): void;
	connect(id: string): void;
	send(text: string): void;
	stop(): void;
	addListener<E extends keyof LinkEvents>(event: E, listener: LinkEvents[E]): { remove(): void };
};

/** The phone-to-phone link (modules/pickle-link). Missing in Expo Go, so rally mode hides itself there. */
export const link = requireOptionalNativeModule<Link>('PickleLink');
