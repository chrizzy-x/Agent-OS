import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createAgentToken } from '../../src/auth/agent-identity.js';
import { mockSupabase } from '../setup.js';
import { POST as postSkill } from '../../app/api/skills/route.js';
import { POST as postApp } from '../../app/api/apps/route.js';
import { POST as postSdkCredential } from '../../app/api/sdk/credentials/route.js';
import { POST as postFromKey } from '../../app/api/session/from-key/route.js';

function authRequest(url: string, plan: string, body: Record<string, unknown>) {
  const token = createAgentToken(`agent-${plan}`, { expiresIn: '1h' });
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function mockPlan(plan: string) {
  mockSupabase.from.mockImplementation((table: string) => {
    if (table === 'agents') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: `agent-${plan}`,
            name: 'Publisher',
            tier: plan,
            metadata: { plan, email: `${plan}@example.com` },
          },
          error: null,
        }),
      };
    }

    if (table === 'skills') {
      return {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'skill-1', slug: 'market-data' }, error: null }),
      };
    }

    if (table === 'agent_apps') {
      return {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'app-1',
            name: 'Research App',
            slug: 'research-app',
            category: 'Research',
            description: 'Research workflows.',
            publisher_id: `agent-${plan}`,
            publisher_name: 'Publisher',
            manifest: {},
            default_config: {},
            device_targets: ['AgentOS Cloud'],
            published: true,
            install_count: 0,
            verified: false,
          },
          error: null,
        }),
      };
    }

    if (table === 'workspace_members') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            role: 'owner',
            workspaces: {
              id: 'workspace-1',
              name: 'Workspace',
              slug: 'workspace',
              owner_id: `agent-${plan}`,
              plan,
              created_at: new Date().toISOString(),
            },
          },
          error: null,
        }),
      };
    }

    if (table === 'sdk_credentials') {
      return {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'cred-1',
            workspace_id: 'workspace-1',
            owner_agent_id: `agent-${plan}`,
            name: 'default',
            public_ref: 'sdk_test_ref',
            scopes: [],
            status: 'active',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          error: null,
        }),
      };
    }

    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
  });
}

describe('server-side plan gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns typed 403 when retail calls Skill creation directly', async () => {
    mockPlan('retail_free');
    const response = await postSkill(authRequest('http://localhost/api/skills', 'retail_free', {
      name: 'Market Data',
      slug: 'market-data',
      category: 'Data',
      description: 'Reads market data.',
    }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain('Enterprise');
  });

  it('allows Enterprise to create Skills', async () => {
    mockPlan('enterprise_plus');
    const response = await postSkill(authRequest('http://localhost/api/skills', 'enterprise_plus', {
      name: 'Market Data',
      slug: 'market-data',
      category: 'Data',
      description: 'Reads market data.',
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.slug).toBe('market-data');
  });

  it('returns typed 403 when retail calls App creation directly', async () => {
    mockPlan('retail_pro');
    const response = await postApp(authRequest('http://localhost/api/apps', 'retail_pro', {
      name: 'Research App',
      category: 'Research',
      description: 'Research workflows.',
      manifest: { version: '1.0.0' },
    }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain('Enterprise');
  });

  it('returns typed 403 when retail calls SDK credential creation directly', async () => {
    mockPlan('retail_pro');
    const response = await postSdkCredential(authRequest('http://localhost/api/sdk/credentials', 'retail_pro', {
      workspaceId: 'workspace-1',
      name: 'default',
      scopes: ['skills:write'],
    }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe('PERMISSION_DENIED');
  });

  it('allows enterprise to create SDK credentials', async () => {
    mockPlan('enterprise_plus');
    const response = await postSdkCredential(authRequest('http://localhost/api/sdk/credentials', 'enterprise_plus', {
      workspaceId: 'workspace-1',
      name: 'default',
      scopes: ['skills:write'],
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.credential.name).toBe('default');
    expect(body.token).toContain('sdk_');
  });

  it('denies bearer-token callback creation for retail_free API keys', async () => {
    mockPlan('retail_free');
    const token = createAgentToken('agent-retail_free', { expiresIn: '1h' });
    const request = new NextRequest('http://localhost/api/session/from-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: token }),
    });
    const response = await postFromKey(request);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe('PERMISSION_DENIED');
  });
});
