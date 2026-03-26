import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createAgentToken } from '../../src/auth/agent-identity.js';
import { mockSupabase } from '../setup.js';
import { GET } from '../../app/agent/me/route.js';

function maybeSingleBuilder(data: unknown, error: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
}

describe('GET /agent/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns external agent details for a valid token', async () => {
    mockSupabase.from.mockReturnValue(maybeSingleBuilder({
      agent_id: 'derek-prime',
      name: 'Agent Derek',
      status: 'active',
      allowed_domains: ['api.binance.com'],
      allowed_tools: ['agentos.net_http_get', 'agentos.mem_set'],
      total_calls: 42,
      last_active_at: '2026-03-22T10:00:00Z',
      created_at: '2026-03-20T08:00:00Z',
    }));

    const token = createAgentToken('derek-prime', { allowedDomains: ['api.binance.com'], expiresIn: '1h' });
    const request = new NextRequest('http://localhost/agent/me', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.agentId).toBe('derek-prime');
    expect(body.totalCalls).toBe(42);
  });

  it('rejects requests without a bearer token', async () => {
    const request = new NextRequest('http://localhost/agent/me', { method: 'GET' });
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('rejects invalid bearer tokens', async () => {
    const request = new NextRequest('http://localhost/agent/me', {
      method: 'GET',
      headers: { Authorization: 'Bearer fake.token.xyz' },
    });

    const response = await GET(request);

    expect(response.status).toBe(401);
  });
});
