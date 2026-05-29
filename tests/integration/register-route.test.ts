import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { mockSupabase } from '../setup.js';
import { POST } from '../../app/register/route.js';


function maybeSingleBuilder(data: unknown, error: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
}

describe('POST /register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a token for a valid self-service registration', async () => {
    mockSupabase.from
      .mockReturnValueOnce(maybeSingleBuilder(null))
      .mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({ error: null }) });

    const request = new NextRequest('http://localhost/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'test-agent-1', name: 'Test', allowedDomains: ['httpbin.org'] }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.agentId).toBeUndefined();
    expect(typeof body.token).toBe('string');
    expect(body.allowedDomains).toEqual(['httpbin.org']);
  });

  it('rejects duplicate registrations without exposing IDs', async () => {
    mockSupabase.from.mockReturnValue(maybeSingleBuilder({ agent_id: 'test-agent-1' }));

    const request = new NextRequest('http://localhost/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'test-agent-1', name: 'Test' }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe('Agent name already registered');
  });

  it('rejects invalid agent ID format', async () => {
    const request = new NextRequest('http://localhost/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'Test Agent!!', name: 'Test' }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('lowercase alphanumeric');
  });
});
