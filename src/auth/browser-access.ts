import type { BrowserSession } from './browser-session.js';

export type BrowserAccessState = 'loading' | 'signed_out' | 'blocked' | 'allowed';

export function resolveBrowserAccessState(
  session: BrowserSession | null,
  loading: boolean,
  capability: string,
): BrowserAccessState {
  if (loading) return 'loading';
  if (!session) return 'signed_out';
  return session.capabilities?.includes(capability) === true ? 'allowed' : 'blocked';
}
