import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createAgentToken } from '../../src/auth/agent-identity.js';
import { mockSupabase } from '../setup.js';
import { POST } from '../../app/api/agent/workflows/route.js';

describe('workflow route canonical sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates workflows from code mode and persists synchronized canonical fields', async () => {
    let insertedPayload: Record<string, unknown> | null = null;

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'agents') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { tier: 'retail_free', metadata: { plan: 'retail_free' } },
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
                owner_id: 'agent-retail_free',
                plan: 'retail_free',
                created_at: new Date().toISOString(),
              },
            },
            error: null,
          }),
        };
      }

      if (table === 'agent_workflows') {
        return {
          insert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
            insertedPayload = payload;
            return {
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: { id: 'workflow-1', ...payload },
                error: null,
              }),
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

    const token = createAgentToken('agent-retail_free', { expiresIn: '1h' });
    const request = new NextRequest('http://localhost/api/agent/workflows', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workspaceId: 'workspace-1',
        name: 'Token risk workflow',
        mode: 'code',
        code: JSON.stringify({
          version: '1.0.0',
          steps: [
            {
              order: 1,
              tool: 'net_http_get',
              description: 'Fetch token data',
              input: { url: 'https://example.com/token' },
            },
          ],
        }),
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(insertedPayload).not.toBeNull();
    expect((insertedPayload?.canonical_doc as { updatedFrom?: string }).updatedFrom).toBe('code');
    expect(Array.isArray(insertedPayload?.steps)).toBe(true);
    expect(((insertedPayload?.graph_state as { nodes?: unknown[] }).nodes ?? []).length).toBe(1);
    expect(typeof insertedPayload?.code_state).toBe('string');
    expect(body.workflow.name).toBe('Token risk workflow');
  });
});
