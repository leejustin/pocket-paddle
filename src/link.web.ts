import type { Link } from './link';

export type { Link, LinkEvents, Peer } from './link';

/** Browsers can't open a direct connection to a nearby phone, so rally mode is app-only. */
export const link: Link | null = null;
