import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createAgentToken } from '../../src/auth/agent-identity.js';
import { mockSupabase } from '../setup.js';
import { POST } from '../../app/api/agent/workflows/route.js';
import { PATCH } from '../../app/api/agent/workflows/[id]/route.js';

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

  it('syncs recurring workflow schedules into scheduled tasks', async () => {
    let insertedTask: Record<string, unknown> | null = null;
    const workflowUpdates: Record<string, unknown>[] = [];
    const existingWorkflow = {
      id: 'workflow-scheduled',
      agent_id: 'agent-retail_free',
      workspace_id: 'workspace-1',
      name: 'Scheduled workflow',
      summary: 'Runs hourly.',
      schedule: null,
      status: 'active',
      task_id: null,
      steps: [{ order: 1, tool: 'net_http_get', description: 'Fetch status', input: { url: 'https://example.com/status' } }],
      graph_state: { nodes: [], edges: [] },
      code_state: null,
      canonical_doc: {},
      version: 1,
    };

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

      if (table === 'agent_workflows') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: existingWorkflow, error: null }),
          update: vi.fn().mockImplementation((patch: Record<string, unknown>) => {
            workflowUpdates.push(patch);
            const chain: {
              error: null;
              eq: ReturnType<typeof vi.fn>;
              select: ReturnType<typeof vi.fn>;
              maybeSingle: ReturnType<typeof vi.fn>;
            } = {
              error: null,
              eq: vi.fn(() => chain),
              select: vi.fn(() => chain),
              maybeSingle: vi.fn().mockResolvedValue({ data: { ...existingWorkflow, ...patch }, error: null }),
            };
            return chain;
          }),
        };
      }

      if (table === 'scheduled_tasks') {
        return {
          insert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
            insertedTask = payload;
            return { error: null };
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            error: null,
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
    const request = new NextRequest('http://localhost/api/agent/workflows/workflow-scheduled', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ schedule: '@hourly', status: 'active' }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: 'workflow-scheduled' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(workflowUpdates[0]).toEqual(expect.objectContaining({ schedule: '@hourly', status: 'active' }));
    expect(insertedTask).toEqual(expect.objectContaining({
      agent_id: 'agent-retail_free',
      code: JSON.stringify({ tool: 'net_http_get', input: { url: 'https://example.com/status' } }),
      language: 'tool',
      cron_expression: '@hourly',
      enabled: true,
      workflow_id: 'workflow-scheduled',
    }));
    expect(typeof insertedTask?.id).toBe('string');
    expect(body.workflow.task_id).toBe(insertedTask?.id);
  });

  it('rejects unsupported recurring workflow schedules', async () => {
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

      if (table === 'agent_workflows') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: 'workflow-scheduled',
              agent_id: 'agent-retail_free',
              name: 'Scheduled workflow',
              status: 'active',
              steps: [],
            },
            error: null,
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
    const request = new NextRequest('http://localhost/api/agent/workflows/workflow-scheduled', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ schedule: 'next thursday maybe' }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: 'workflow-scheduled' }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('schedule must be');
  });
});
