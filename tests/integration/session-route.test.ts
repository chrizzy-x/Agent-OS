import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createAgentToken } from '../../src/auth/agent-identity.js';
import { mockSupabase } from '../setup.js';
import { DELETE, GET } from '../../app/api/session/route.js';
import { POST as issueToken } from '../../app/api/session/token/route.js';

describe('session routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockReset();
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'agent-1', name: 'Agent One' }, error: null }),
    });
  });

  it('returns 401 and clears the cookie when no session is present', async () => {
    const request = new NextRequest('http://localhost/api/session', { method: 'GET' });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.authenticated).toBe(false);
    expect(response.headers.get('set-cookie')).toContain('agent_session=');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
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
    expect(body.session.agentId).toBe('agent-1');
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
    expect(body.credentials.agentId).toBe('agent-1');
    expect(body.credentials.bearerToken).toBeTruthy();
    expect(response.headers.get('set-cookie')).toContain('agent_session=');
  });

  it('clears the cookie on sign out', async () => {
    const response = await DELETE();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(response.headers.get('set-cookie')).toContain('agent_session=');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});
