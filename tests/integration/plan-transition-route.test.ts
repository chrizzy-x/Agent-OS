import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createAgentToken } from '../../src/auth/agent-identity.js';
import { mockSupabase } from '../setup.js';
import { POST } from '../../app/api/plans/transition/route.js';

function request(plan: string, body: Record<string, unknown>) {
  const token = createAgentToken('agent-1', { expiresIn: '1h' });
  return new NextRequest('http://localhost/api/plans/transition', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ currentPlan: plan, ...body }),
  });
}

describe('POST /api/plans/transition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'agents') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: 'agent-1',
              tier: 'retail_free',
              metadata: { plan: 'retail_free', account_type: 'retail' },
            },
            error: null,
          }),
          update: vi.fn().mockReturnThis(),
        };
      }

      if (table === 'workspaces') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 'workspace-1', owner_id: 'agent-1', plan: 'retail_free' },
            error: null,
          }),
          update: vi.fn().mockReturnThis(),
        };
      }

      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });
  });

  it('transitions plans through the free beta upgrade flow', async () => {
    const response = await POST(request('retail_free', { newPlan: 'enterprise_max' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.transitioned).toBe(true);
    expect(body.transition.newPlan).toBe('enterprise_max');
    expect(body.billing).toEqual({ mode: 'free_beta', charged: false });
  });

  it('returns noChange when the requested plan already matches the current plan', async () => {
    const response = await POST(request('retail_free', { newPlan: 'retail_free' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.transitioned).toBe(false);
    expect(body.noChange).toBe(true);
  });

  it('rejects invalid target plans', async () => {
    const response = await POST(request('retail_free', { newPlan: 'free' }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('supports retail to pro upgrades without sales gating', async () => {
    const response = await POST(request('retail_free', { newPlan: 'retail_pro' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.transitioned).toBe(true);
    expect(body.transition.newPlan).toBe('retail_pro');
  });
});
