import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createAgentToken } from '../../src/auth/agent-identity.js';
import { mockSupabase, mockRedis } from '../setup.js';
import { POST } from '../../app/api/studio/command/route.js';

function createSelectBuilder(data: unknown, error: unknown = null) {
  return {
    data,
    error,
    select() { return this; },
    eq() { return this; },
    order() { return this; },
    limit() { return this; },
    single: vi.fn().mockResolvedValue({ data, error }),
  };
}

describe('POST /api/studio/command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.get.mockResolvedValue('hash');
    mockRedis.del.mockResolvedValue(1);
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'skills') {
        return createSelectBuilder({
          id: 'skill-1',
          slug: 'pdf-processor',
          name: 'PDF Processor',
          category: 'Docs',
          description: 'Extract text from PDFs.',
          pricing_model: 'free',
          total_installs: 3,
          published: true,
        });
      }

      if (table === 'skill_installations') {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          data: [{ id: 'install-1' }],
          error: null,
        };
      }

      if (table === 'mcp_servers') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }

      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        insert: vi.fn().mockResolvedValue({ error: null }),
        data: [],
        error: null,
      };
    });
  });

  it('returns a result for read-only Studio commands', async () => {
    const token = createAgentToken('agent-1', { expiresIn: '1h' });
    const request = new NextRequest('http://localhost/api/studio/command', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ command: 'help' }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.kind).toBe('help');
    expect(body.summary).toContain('Studio supports');
  });

  it('returns a preview for mutating Studio commands before execution', async () => {
    const token = createAgentToken('agent-1', { expiresIn: '1h' });
    const request = new NextRequest('http://localhost/api/studio/command', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ command: 'skills install pdf-processor' }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.kind).toBe('preview');
    expect(body.confirmToken).toBeTruthy();
  });
});
