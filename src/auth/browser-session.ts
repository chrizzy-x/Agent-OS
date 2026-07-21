export interface BrowserSession {
  agentName: string | null;
  avatarUrl?: string | null;
  plan?: string;
  planLabel?: string;
  accountType?: 'retail' | 'enterprise';
  capabilities?: string[];
  limits?: string[];
  upgradePath?: string;
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
const KNOWN_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 120;

function readStorage(storage: Storage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(storage: Storage | undefined, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Session persistence should never block auth on locked-down browsers.
  }
}

function removeStorage(storage: Storage | undefined, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    // Session persistence should never block logout on locked-down browsers.
  }
}

export function clearLegacyBrowserAuth(): void {
  if (typeof window === 'undefined') return;
  removeStorage(window.localStorage, 'apiKey');
  removeStorage(window.localStorage, 'agentId');
}

function rememberBrowserSession(): void {
  if (typeof window === 'undefined') return;
  const marker = JSON.stringify({ seenAt: Date.now() });
  writeStorage(window.sessionStorage, KNOWN_SESSION_KEY, '1');
  writeStorage(window.localStorage, KNOWN_SESSION_KEY, marker);
}

function forgetBrowserSession(): void {
  if (typeof window === 'undefined') return;
  removeStorage(window.sessionStorage, KNOWN_SESSION_KEY);
  removeStorage(window.localStorage, KNOWN_SESSION_KEY);
}

function hasKnownBrowserSession(): boolean {
  if (typeof window === 'undefined') return false;
  if (readStorage(window.sessionStorage, KNOWN_SESSION_KEY) === '1') return true;

  const raw = readStorage(window.localStorage, KNOWN_SESSION_KEY);
  if (!raw) return false;
  if (raw === '1') {
    rememberBrowserSession();
    return true;
  }
  try {
    const marker = JSON.parse(raw) as { seenAt?: unknown };
    const seenAt = typeof marker.seenAt === 'number' ? marker.seenAt : 0;
    if (seenAt > 0 && Date.now() - seenAt <= KNOWN_SESSION_TTL_MS) {
      writeStorage(window.sessionStorage, KNOWN_SESSION_KEY, '1');
      return true;
    }
  } catch {
    removeStorage(window.localStorage, KNOWN_SESSION_KEY);
  }
  return false;
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
