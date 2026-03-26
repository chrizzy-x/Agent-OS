import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createAgentToken } from '../../src/auth/agent-identity.js';
import { mockRedis, mockSupabase } from '../setup.js';
import { POST } from '../../app/mcp/route.js';

function maybeSingleBuilder(data: unknown, error: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
}

describe('POST /mcp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.incr.mockResolvedValue(1);
    mockRedis.incrby.mockResolvedValue(0);
    mockRedis.expire.mockResolvedValue(1);
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });
  });

  it('executes allowed calls for registered external agents and tracks them', async () => {
    mockSupabase.from.mockReturnValue(maybeSingleBuilder({
      agent_id: 'external-agent-1',
      name: 'External Agent',
      status: 'active',
      allowed_domains: ['*'],
      allowed_tools: ['agentos.mem_set'],
      total_calls: 0,
      last_active_at: null,
      created_at: '2026-03-22T00:00:00Z',
    }));

    const token = createAgentToken('external-agent-1', { allowedDomains: ['*'], expiresIn: '1h' });
    const request = new NextRequest('http://localhost/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tool: 'agentos.mem_set', input: { key: 'hello', value: 'world' } }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.result.key).toBe('hello');
    expect(mockSupabase.rpc).toHaveBeenCalledWith('increment_ext_agent_calls', { row_agent_id: 'external-agent-1' });
  });

  it('blocks tools that were not granted to the external agent', async () => {
    mockSupabase.from.mockReturnValue(maybeSingleBuilder({
      agent_id: 'external-agent-1',
      name: 'External Agent',
      status: 'active',
      allowed_domains: ['*'],
      allowed_tools: ['agentos.mem_get'],
      total_calls: 0,
      last_active_at: null,
      created_at: '2026-03-22T00:00:00Z',
    }));

    const token = createAgentToken('external-agent-1', { allowedDomains: ['*'], expiresIn: '1h' });
    const request = new NextRequest('http://localhost/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tool: 'agentos.mem_set', input: { key: 'hello', value: 'world' } }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('PERMISSION_DENIED');
  });
});
