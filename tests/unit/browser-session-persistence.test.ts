import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { destroyBrowserSession, fetchBrowserSessionState } from '../../src/auth/browser-session.js';

const SESSION_MARKER_KEY = 'agentos.browserSessionSeen';

function createStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
    getItem(key: string) {
      return entries.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(entries.keys())[index] ?? null;
    },
    removeItem(key: string) {
      entries.delete(key);
    },
    setItem(key: string, value: string) {
      entries.set(key, value);
    },
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('browser session persistence', () => {
  let localStorageMock: Storage;
  let sessionStorageMock: Storage;

  beforeEach(() => {
    localStorageMock = createStorage();
    sessionStorageMock = createStorage();
    vi.stubGlobal('window', {
      localStorage: localStorageMock,
      sessionStorage: sessionStorageMock,
    });
    vi.stubGlobal('localStorage', localStorageMock);
    vi.stubGlobal('sessionStorage', sessionStorageMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports expired after browser restart when durable marker remains and refresh fails', async () => {
    localStorageMock.setItem(SESSION_MARKER_KEY, JSON.stringify({ seenAt: Date.now() }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ authenticated: false }))
      .mockResolvedValueOnce(jsonResponse({ authenticated: false, error: 'refresh_required' }));
    vi.stubGlobal('fetch', fetchMock);

    const state = await fetchBrowserSessionState();

    expect(state.state).toBe('expired');
    expect(state.session).toBeNull();
    expect(sessionStorageMock.getItem(SESSION_MARKER_KEY)).toBe('1');
  });

  it('refreshes an expired access cookie and preserves only a non-secret marker', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ authenticated: false }))
      .mockResolvedValueOnce(jsonResponse({ authenticated: true }))
      .mockResolvedValueOnce(jsonResponse({
        authenticated: true,
        session: {
          agentName: 'Agent One',
          plan: 'retail_free',
          planLabel: 'Free',
          accountType: 'retail',
          capabilities: ['use_nl_studio'],
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const state = await fetchBrowserSessionState();

    expect(state.state).toBe('active');
    expect(state.session?.agentName).toBe('Agent One');
    expect(localStorageMock.getItem(SESSION_MARKER_KEY)).toContain('seenAt');
    expect(localStorageMock.getItem('apiKey')).toBeNull();
    expect(localStorageMock.getItem('agentId')).toBeNull();
  });

  it('clears markers and legacy local auth on logout', async () => {
    localStorageMock.setItem(SESSION_MARKER_KEY, JSON.stringify({ seenAt: Date.now() }));
    localStorageMock.setItem('apiKey', 'legacy-key');
    localStorageMock.setItem('agentId', 'legacy-agent');
    sessionStorageMock.setItem(SESSION_MARKER_KEY, '1');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
    vi.stubGlobal('fetch', fetchMock);

    await destroyBrowserSession();

    expect(fetchMock).toHaveBeenCalledWith('/api/session', { method: 'DELETE', credentials: 'include' });
    expect(localStorageMock.getItem(SESSION_MARKER_KEY)).toBeNull();
    expect(sessionStorageMock.getItem(SESSION_MARKER_KEY)).toBeNull();
    expect(localStorageMock.getItem('apiKey')).toBeNull();
    expect(localStorageMock.getItem('agentId')).toBeNull();
  });
});
