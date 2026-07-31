import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { mockSupabase } from '../setup.js';

const routeMocks = vi.hoisted(() => ({
  requireRouteCapability: vi.fn(),
  findAccountById: vi.fn(),
}));

vi.mock('../../src/auth/request.js', () => ({
  requireRouteCapability: routeMocks.requireRouteCapability,
}));

vi.mock('../../src/auth/agent-store.js', () => ({
  findAccountById: routeMocks.findAccountById,
}));

import { POST } from '../../app/api/skills/route.js';

describe('skills route DB compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.requireRouteCapability.mockResolvedValue({ agentId: 'agent-1', tier: 'enterprise_plus' });
    routeMocks.findAccountById.mockResolvedValue({ id: 'agent-1', name: 'Publisher' });
  });

  it('falls back when PostgREST reports missing visibility in schema cache', async () => {
    const inserted: Array<Record<string, unknown>> = [];

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'skills') {
        return {
          insert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
            inserted.push(payload);
            return {
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue(inserted.length === 1
                ? { data: null, error: { code: 'PGRST204', message: "Could not find the 'visibility' column of 'skills' in the schema cache" } }
                : { data: { id: 'skill-1', slug: payload.slug }, error: null }),
            };
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    const response = await POST(new NextRequest('http://localhost/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Proof Normalizer',
        slug: 'proof-normalizer',
        category: 'Utilities',
        description: 'Normalizes proof text.',
        publish_state: 'published',
        visibility: 'private',
        capabilities: [{ name: 'normalize' }],
        source_code: 'class Skill {}',
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.slug).toBe('proof-normalizer');
    expect(inserted).toHaveLength(2);
    expect(inserted[0].visibility).toBe('private');
    expect(inserted[1]).not.toHaveProperty('visibility');
  });
});
