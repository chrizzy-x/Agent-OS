import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { mockSupabase } from '../setup.js';
import { POST } from '../../app/api/signup/route.js';

function createSignupRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'new@example.com',
      password: 'strongpass123',
      agentName: 'New Agent',
      ...body,
    }),
  });
}

function mockSignupDatabase(options: { duplicateInsert?: boolean } = {}) {
  const insertedAgents: Record<string, unknown>[] = [];
  const upserts: Array<{ table: string; payload: Record<string, unknown> }> = [];

  mockSupabase.from.mockImplementation((table: string) => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    order: vi.fn().mockReturnThis(),
    insert: vi.fn(async (payload: Record<string, unknown>) => {
      if (table === 'agents' && options.duplicateInsert) {
        return { error: { code: '23505', message: 'duplicate key value violates unique constraint agents_email' } };
      }
      if (table === 'agents') insertedAgents.push(payload);
      return { error: null };
    }),
    upsert: vi.fn(async (payload: Record<string, unknown>) => {
      upserts.push({ table, payload });
      return { error: null };
    }),
  }));

  return { insertedAgents, upserts };
}

describe('POST /api/signup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['retail', 'retail_free', false],
    ['retail', 'retail_pro', true],
    ['enterprise', 'enterprise_plus', true],
    ['enterprise', 'enterprise_max', true],
  ] as const)('provisions AgentOS for %s %s signups', async (accountType, selectedPlan, hasBearerAccess) => {
    const db = mockSignupDatabase();

    const response = await POST(createSignupRequest({ accountType, selectedPlan }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.redirectTo).toBe('/studio');
    if (hasBearerAccess) {
      expect(body.credentials.bearerToken).toBeTruthy();
    } else {
      expect(body.credentials.bearerToken).toBeNull();
    }
    expect(body.credentials.plan).toBe(selectedPlan);
    expect(body.credentials.planPriceUsd).toBe(0);
    expect(body.credentials.capabilities).toContain('use_nl_studio');
    expect(response.headers.get('set-cookie')).toContain('agent_session=');
    expect(db.insertedAgents[0].metadata).toMatchObject({
      account_type: accountType,
      plan: selectedPlan,
      plan_price_usd: 0,
    });
    expect(db.upserts.map(item => item.table)).toEqual(expect.arrayContaining([
      'workspaces',
      'workspace_members',
      'workspace_agents',
      'instruction_profiles',
      'super_agents',
      'nl_studio_sessions',
      'vaults',
    ]));
  });

  it.each([
    ['retail', 'enterprise_plus'],
    ['retail', 'enterprise_max'],
    ['enterprise', 'retail_free'],
    ['enterprise', 'retail_pro'],
  ] as const)('rejects invalid %s %s combinations', async (accountType, selectedPlan) => {
    mockSignupDatabase();

    const response = await POST(createSignupRequest({ accountType, selectedPlan }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('invalid_plan');
  });

  it('returns 409 when the database rejects a duplicate email at insert time', async () => {
    mockSignupDatabase({ duplicateInsert: true });

    const response = await POST(createSignupRequest({ accountType: 'retail', selectedPlan: 'retail_free' }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.message).toContain('already exists');
  });
});
