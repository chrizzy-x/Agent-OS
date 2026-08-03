import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createAgentToken } from '../../src/auth/agent-identity.js';
import { mockSupabase } from '../setup.js';
import { POST as issueToken } from '../../app/api/session/token/route.js';

const browserSessionMocks = vi.hoisted(() => ({
  findRefreshSessionByToken: vi.fn(),
  revokeRefreshSession: vi.fn(),
  revokeAllRefreshSessions: vi.fn(),
}));

vi.mock('../../src/auth/browser-sessions.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/auth/browser-sessions.js')>('../../src/auth/browser-sessions.js');
  return {
    ...actual,
    findRefreshSessionByToken: browserSessionMocks.findRefreshSessionByToken,
    revokeRefreshSession: browserSessionMocks.revokeRefreshSession,
    revokeAllRefreshSessions: browserSessionMocks.revokeAllRefreshSessions,
  };
});

import { DELETE, GET } from '../../app/api/session/route.js';

describe('session routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockReset();
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'agent-1', name: 'Agent One', tier: 'retail_pro', metadata: { plan: 'retail_pro' } },
        error: null,
      }),
    });
    browserSessionMocks.findRefreshSessionByToken.mockResolvedValue(null);
    browserSessionMocks.revokeRefreshSession.mockResolvedValue(undefined);
    browserSessionMocks.revokeAllRefreshSessions.mockResolvedValue(undefined);
  });

  it('returns 401 without clearing cookies when no session cookie is present', async () => {
    const request = new NextRequest('http://localhost/api/session', { method: 'GET' });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.authenticated).toBe(false);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('clears browser cookies when a presented session cookie is invalid', async () => {
    const request = new NextRequest('http://localhost/api/session', {
      method: 'GET',
      headers: {
        Cookie: 'agent_access=not.a.jwt',
      },
    });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.authenticated).toBe(false);
    expect(response.headers.get('set-cookie')).toContain('agent_session=');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('does not clear fresh login cookies from an optional no-cookie probe', async () => {
    const request = new NextRequest('http://localhost/api/session?optional=1', { method: 'GET' });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.authenticated).toBe(false);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('returns the authenticated session from the secure session cookie', async () => {
    const token = createAgentToken('agent-1', { expiresIn: '1h' });
    const request = new NextRequest('http://localhost/api/session', {
      method: 'GET',
      headers: {
        Cookie: `agent_session=${token}`,
      },
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.authenticated).toBe(true);
    expect(body.session.agentId).toBeUndefined();
    expect(body.session.agentName).toBe('Agent One');
  });

  it('issues a fresh bearer token from an authenticated browser session', async () => {
    const token = createAgentToken('agent-1', { expiresIn: '1h' });
    const request = new NextRequest('http://localhost/api/session/token', {
      method: 'POST',
      headers: {
        Cookie: `agent_session=${token}`,
      },
    });

    const response = await issueToken(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.credentials.bearerToken).toBeTruthy();
    expect(response.headers.get('set-cookie')).toContain('agent_session=');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not mark browser session cookies as secure on localhost http requests', async () => {
    const token = createAgentToken('agent-1', { expiresIn: '1h' });
    const request = new NextRequest('http://127.0.0.1:3000/api/session/token', {
      method: 'POST',
      headers: {
        Cookie: `agent_session=${token}`,
      },
    });

    const response = await issueToken(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).not.toContain('Secure');
  });

  it('clears the cookie on sign out', async () => {
    const request = new NextRequest('http://localhost/api/session', { method: 'DELETE' });
    const response = await DELETE(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(response.headers.get('set-cookie')).toContain('agent_session=');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('revokes only the current refresh session for normal sign out', async () => {
    browserSessionMocks.findRefreshSessionByToken.mockResolvedValue({
      id: 'refresh-1',
      agentId: 'agent-1',
    });
    const request = new NextRequest('http://localhost/api/session', {
      method: 'DELETE',
      headers: {
        Cookie: 'agent_refresh=selector.secret',
      },
    });

    const response = await DELETE(request);

    expect(response.status).toBe(200);
    expect(browserSessionMocks.revokeRefreshSession).toHaveBeenCalledWith({ agentId: 'agent-1', sessionId: 'refresh-1' });
    expect(browserSessionMocks.revokeAllRefreshSessions).not.toHaveBeenCalled();
  });

  it('clears browser cookies even when refresh session revocation stalls', async () => {
    vi.useFakeTimers();
    browserSessionMocks.findRefreshSessionByToken.mockReturnValue(new Promise(() => undefined));
    const request = new NextRequest('http://localhost/api/session', {
      method: 'DELETE',
      headers: {
        Cookie: 'agent_refresh=selector.secret',
      },
    });

    const responsePromise = DELETE(request);
    await vi.advanceTimersByTimeAsync(2500);
    const response = await responsePromise;
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(response.headers.get('set-cookie')).toContain('agent_session=');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(browserSessionMocks.revokeRefreshSession).not.toHaveBeenCalled();
  });
});
