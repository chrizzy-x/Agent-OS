/**
 * End-to-end tests for the AgentOS HTTP server.
 *
 * These tests start the actual HTTP server (no mocks) against in-memory
 * Redis and Supabase test doubles. They verify the full request lifecycle:
 * auth → routing → tool dispatch → response serialization.
 *
 * The server is started once per test file and torn down in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, Server } from 'http';
import { createAgentToken } from '../../src/auth/agent-identity.js';

// Re-mock storage so no real Redis/Supabase is needed in e2e
import { mockRedis, mockSupabase } from '../setup.js';

let server: Server;
let baseUrl: string;
let agentToken: string;

beforeAll(async () => {
  // Prepare mocks
  mockRedis.get.mockResolvedValue(null);
  mockRedis.set.mockResolvedValue('OK');
  mockRedis.del.mockResolvedValue(0);
  mockRedis.incr.mockResolvedValue(1);
  mockRedis.incrby.mockResolvedValue(0);
  mockRedis.expire.mockResolvedValue(1);
  mockRedis.keys.mockResolvedValue([]);
  mockRedis.lrange.mockResolvedValue([]);

  mockSupabase.from.mockReturnValue({
    insert: vi.fn().mockResolvedValue({ error: null }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
  });

  // Dynamically import the handler after mocks are in place
  const { default: handler } = await import('../../src/index.js');

  server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;

  agentToken = createAgentToken('e2e-agent', {
    allowedDomains: ['httpbin.org'],
    expiresIn: '1h',
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close(err => (err ? reject(err) : resolve()))
  );
});

async function callTool(tool: string, input: unknown) {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${agentToken}`,
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
  it('returns the tool list', async () => {
    const res = await fetch(`${baseUrl}/tools`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.tools).toContain('mem_set');
    expect(body.tools).toContain('fs_write');
    expect(body.tools).toContain('proc_execute');
  });
});

describe('POST /mcp — authentication', () => {
  it('returns 401 without Authorization header', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'mem_get', input: { key: 'x' } }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 with an expired/invalid token', async () => {
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

describe('POST /mcp — routing', () => {
  it('returns 404 for unknown tool', async () => {
    const { status, body } = await callTool('nonexistent_tool', {});
    expect(status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for malformed JSON body', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${agentToken}` },
      body: 'not json {{{',
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /mcp — mem_set + mem_get round-trip', () => {
  it('stores and retrieves a value', async () => {
    mockRedis.get
      .mockResolvedValueOnce(null)   // mem_set: key not yet existing
      .mockResolvedValueOnce(null)   // mem_usage counter = 0
      .mockResolvedValueOnce('"stored-value"'); // mem_get: return value

    const setResp = await callTool('mem_set', { key: 'e2e-key', value: 'stored-value' });
    expect(setResp.status).toBe(200);
    expect(setResp.body.result.key).toBe('e2e-key');

    const getResp = await callTool('mem_get', { key: 'e2e-key' });
    expect(getResp.status).toBe(200);
    expect(getResp.body.result.value).toBe('stored-value');
  });
});

describe('POST /mcp — validation errors', () => {
  it('returns 400 for missing required field', async () => {
    const { status, body } = await callTool('mem_set', { value: 'no key field' });
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for key exceeding max length', async () => {
    const { status } = await callTool('mem_get', { key: 'x'.repeat(513) });
    expect(status).toBe(400);
  });
});

describe('POST /admin/agents', () => {
  it('creates an agent with valid admin token', async () => {
    const res = await fetch(`${baseUrl}/admin/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.ADMIN_TOKEN}`,
      },
      body: JSON.stringify({ agentId: 'new-agent', allowedDomains: [] }),
    });
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.agentId).toBe('new-agent');
    expect(typeof body.token).toBe('string');
  });

  it('returns 401 with wrong admin token', async () => {
    const res = await fetch(`${baseUrl}/admin/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer wrong-admin-token',
      },
      body: JSON.stringify({ agentId: 'hacker' }),
    });
    expect(res.status).toBe(401);
  });
});
