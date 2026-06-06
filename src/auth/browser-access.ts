import type { BrowserSession, BrowserSessionAuthState } from './browser-session.js';

export type BrowserAccessState = 'loading' | 'signed_out' | 'expired' | 'forbidden' | 'allowed';

export function resolveBrowserAccessState(
  session: BrowserSession | null,
  loading: boolean,
  capability: string,
  authState: BrowserSessionAuthState = session ? 'active' : 'signed_out',
): BrowserAccessState {
  if (loading) return 'loading';
  if (!session) return authState === 'expired' ? 'expired' : 'signed_out';
  return session.capabilities?.includes(capability) === true ? 'allowed' : 'forbidden';
}
