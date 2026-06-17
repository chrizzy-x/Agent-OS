export interface BrowserSession {
  agentName: string | null;
  avatarUrl?: string | null;
  plan?: string;
  planLabel?: string;
  accountType?: 'retail' | 'enterprise';
  capabilities?: string[];
  expiresAt: string | null;
}

export type BrowserSessionAuthState = 'active' | 'signed_out' | 'expired';

export interface BrowserSessionState {
  state: BrowserSessionAuthState;
  session: BrowserSession | null;
}

export interface BrowserTokenCredentials {
  bearerToken: string;
  apiKey: string;
  expiresIn: string;
}

const KNOWN_SESSION_KEY = 'agentos.browserSessionSeen';

export function clearLegacyBrowserAuth(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('apiKey');
  localStorage.removeItem('agentId');
}

function rememberBrowserSession(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(KNOWN_SESSION_KEY, '1');
}

function forgetBrowserSession(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(KNOWN_SESSION_KEY);
}

function hasKnownBrowserSession(): boolean {
  if (typeof window === 'undefined') return false;
  return window.sessionStorage.getItem(KNOWN_SESSION_KEY) === '1';
}

async function refreshBrowserSession(): Promise<boolean> {
  const response = await fetch('/api/session/refresh', {
    method: 'POST',
    cache: 'no-store',
    credentials: 'include',
  });
  if (!response.ok) return false;
  const payload = await response.json().catch(() => null) as { authenticated?: boolean } | null;
  return payload?.authenticated === true;
}

async function readBrowserSession(optional = true): Promise<BrowserSessionState> {
  const response = await fetch(`/api/session${optional ? '?optional=1' : ''}`, {
    cache: 'no-store',
    credentials: 'include',
  });
  if (!response.ok) {
    clearLegacyBrowserAuth();
    return {
      state: hasKnownBrowserSession() ? 'expired' : 'signed_out',
      session: null,
    };
  }

  const payload = await response.json() as { authenticated?: boolean; session?: BrowserSession };
  if (payload.authenticated) {
    rememberBrowserSession();
    return {
      state: 'active',
      session: payload.session ?? null,
    };
  }

  return {
    state: hasKnownBrowserSession() ? 'expired' : 'signed_out',
    session: null,
  };
}

export async function fetchBrowserSessionState(): Promise<BrowserSessionState> {
  const current = await readBrowserSession(true);
  if (current.state === 'active') return current;

  const refreshed = await refreshBrowserSession().catch(() => false);
  if (!refreshed) {
    clearLegacyBrowserAuth();
    return {
      state: hasKnownBrowserSession() ? 'expired' : 'signed_out',
      session: null,
    };
  }

  return readBrowserSession(true);
}

export async function fetchBrowserSession(): Promise<BrowserSession | null> {
  return (await fetchBrowserSessionState()).session;
}

export async function fetchWithBrowserSession(input: RequestInfo | URL, init?: RequestInit): Promise<{ response: Response; authState: BrowserSessionAuthState }> {
  const requestInit: RequestInit = { ...init, credentials: init?.credentials ?? 'include' };
  const response = await fetch(input, requestInit);
  if (response.status !== 401) {
    if (response.ok) rememberBrowserSession();
    return { response, authState: 'active' };
  }

  const refreshed = await refreshBrowserSession().catch(() => false);
  if (!refreshed) {
    clearLegacyBrowserAuth();
    return {
      response,
      authState: hasKnownBrowserSession() ? 'expired' : 'signed_out',
    };
  }

  const retry = await fetch(input, requestInit);
  if (retry.ok) {
    rememberBrowserSession();
    return { response: retry, authState: 'active' };
  }
  if (retry.status === 401) {
    clearLegacyBrowserAuth();
    return {
      response: retry,
      authState: hasKnownBrowserSession() ? 'expired' : 'signed_out',
    };
  }
  return { response: retry, authState: 'active' };
}

export async function destroyBrowserSession(): Promise<void> {
  await fetch('/api/session', { method: 'DELETE', credentials: 'include' });
  clearLegacyBrowserAuth();
  forgetBrowserSession();
}

export async function issueBrowserToken(): Promise<BrowserTokenCredentials> {
  const response = await fetch('/api/session/token', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });

  const payload = await response.json() as { credentials?: BrowserTokenCredentials; error?: string };
  if (!response.ok || !payload.credentials) {
    throw new Error(payload.error || 'Failed to generate a bearer token');
  }

  return payload.credentials;
}
