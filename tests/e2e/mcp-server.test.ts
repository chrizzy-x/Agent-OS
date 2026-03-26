import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, Server } from 'http';
import { mockRedis, mockSupabase } from '../setup.js';

let server: Server;
let baseUrl: string;
let defaultAgentToken: string;
let registrations = new Map<string, {
  agent_id: string;
  name: string;
  description: string | null;
  owner_email: string | null;
  allowed_domains: string[];
  allowed_tools: string[];
  status: string;
  total_calls: number;
  last_active_at: string | null;
  created_at: string;
}>();

function emptyChain() {
  return {
    insert: vi.fn().mockResolvedValue({ error: null }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
}

beforeAll(async () => {
  const { createAgentToken } = await import('../../src/auth/agent-identity.js');
  defaultAgentToken = createAgentToken('e2e-agent', {
    allowedDomains: ['httpbin.org'],
    expiresIn: '1h',
  });

  const { default: handler } = await import('../../src/index.js');
  server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
});

beforeEach(() => {
  registrations = new Map();
  vi.clearAllMocks();

  mockRedis.get.mockResolvedValue(null);
  mockRedis.set.mockResolvedValue('OK');
  mockRedis.del.mockResolvedValue(0);
  mockRedis.incr.mockResolvedValue(1);
  mockRedis.incrby.mockResolvedValue(0);
  mockRedis.expire.mockResolvedValue(1);
  mockRedis.keys.mockResolvedValue([]);
  mockRedis.lrange.mockResolvedValue([]);

  mockSupabase.rpc.mockImplementation(async (fn: string, params: Record<string, unknown>) => {
    if (fn === 'increment_ext_agent_calls') {
      const agentId = String(params.row_agent_id);
      const row = registrations.get(agentId);
      if (row) {
        row.total_calls += 1;
        row.last_active_at = new Date().toISOString();
      }
      return { data: null, error: null };
    }

    return { data: [], error: null };
  });

  mockSupabase.from.mockImplementation((table: string) => {
    if (table === 'external_agent_registrations') {
      const state: { agentId?: string } = {};
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn(function (this: unknown, column: string, value: string) {
          if (column === 'agent_id') {
            state.agentId = value;
          }
          return this;
        }),
        maybeSingle: vi.fn().mockImplementation(async () => ({
          data: state.agentId ? registrations.get(state.agentId) ?? null : null,
          error: null,
        })),
        insert: vi.fn().mockImplementation(async (payload: Record<string, unknown>) => {
          const row = {
            agent_id: String(payload.agent_id),
            name: String(payload.name),
            description: payload.description ? String(payload.description) : null,
            owner_email: payload.owner_email ? String(payload.owner_email) : null,
            allowed_domains: (payload.allowed_domains as string[]) ?? [],
            allowed_tools: (payload.allowed_tools as string[]) ?? [],
            status: String(payload.status ?? 'active'),
            total_calls: 0,
            last_active_at: null,
            created_at: '2026-03-22T00:00:00Z',
          };
          registrations.set(row.agent_id, row);
          return { error: null };
        }),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    }

    if (table === 'skills' || table === 'mcp_servers') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    }

    return emptyChain();
  });
});

async function callMcp(token: string, tool: string, input: unknown) {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ tool, input }),
  });

  return { status: res.status, body: await res.json() };
}

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await fetch(`${baseUrl}/health`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.tools).toBeGreaterThan(0);
  });
});

describe('GET /tools', () => {
  it('returns the universal tool list', async () => {
    const res = await fetch(`${baseUrl}/tools`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.tools.some((tool: { name: string }) => tool.name === 'agentos.mem_set')).toBe(true);
    expect(body.tools.some((tool: { name: string }) => tool.name === 'agentos.fs_write')).toBe(true);
  });
});

describe('POST /register and GET /agent/me', () => {
  it('registers an agent and returns its profile', async () => {
    const registerRes = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'test-agent-1', name: 'Test Agent', allowedDomains: ['httpbin.org'] }),
    });
    const registerBody = await registerRes.json();

    expect(registerRes.status).toBe(200);
    expect(typeof registerBody.token).toBe('string');

    const meRes = await fetch(`${baseUrl}/agent/me`, {
      headers: { Authorization: `Bearer ${registerBody.token}` },
    });
    const meBody = await meRes.json();

    expect(meRes.status).toBe(200);
    expect(meBody.agentId).toBe('test-agent-1');
    expect(meBody.totalCalls).toBe(0);
  });

  it('rejects duplicate registrations and invalid ids', async () => {
    await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'test-agent-1', name: 'Test Agent' }),
    });

    const duplicateRes = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'test-agent-1', name: 'Duplicate' }),
    });
    const duplicateBody = await duplicateRes.json();

    const invalidRes = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'INVALID NAME!!', name: 'Broken' }),
    });
    const invalidBody = await invalidRes.json();

    expect(duplicateRes.status).toBe(409);
    expect(duplicateBody.error).toBe('Agent ID already registered');
    expect(invalidRes.status).toBe(400);
    expect(invalidBody.error).toContain('lowercase alphanumeric');
  });
});

describe('POST /mcp - authentication', () => {
  it('returns 401 without Authorization header', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'mem_get', input: { key: 'x' } }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 with an invalid token', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid.jwt.token',
      },
      body: JSON.stringify({ tool: 'mem_get', input: { key: 'x' } }),
    });
    expect(res.status).toBe(401);
  });
});

describe('POST /mcp - routing and tracking', () => {
  it('returns 404 for unknown tools', async () => {
    const { status, body } = await callMcp(defaultAgentToken, 'nonexistent_tool', {});
    expect(status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('stores and retrieves memory values with success=true', async () => {
    mockRedis.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('"stored-value"');

    const setRes = await callMcp(defaultAgentToken, 'mem_set', { key: 'e2e-key', value: 'stored-value' });
    const getRes = await callMcp(defaultAgentToken, 'mem_get', { key: 'e2e-key' });

    expect(setRes.status).toBe(200);
    expect(setRes.body.success).toBe(true);
    expect(setRes.body.result.key).toBe('e2e-key');
    expect(getRes.status).toBe(200);
    expect(getRes.body.result.value).toBe('stored-value');
  });

  it('tracks successful calls for registered external agents', async () => {
    const registerRes = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'tracked-agent', name: 'Tracked Agent', allowedDomains: ['httpbin.org'] }),
    });
    const registerBody = await registerRes.json();

    mockRedis.get.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    const mcpRes = await callMcp(registerBody.token, 'agentos.mem_set', { key: 'tracked', value: 'ok' });
    expect(mcpRes.status).toBe(200);

    const meRes = await fetch(`${baseUrl}/agent/me`, {
      headers: { Authorization: `Bearer ${registerBody.token}` },
    });
    const meBody = await meRes.json();

    expect(meBody.totalCalls).toBe(1);
  });
});

