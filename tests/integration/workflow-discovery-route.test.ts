import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { mockSupabase } from '../setup.js';

const routeMocks = vi.hoisted(() => ({
  requireRouteCapability: vi.fn(),
  resolveDefaultWorkspaceForAgent: vi.fn(),
}));

vi.mock('../../src/auth/request.js', () => ({
  requireRouteCapability: routeMocks.requireRouteCapability,
}));

vi.mock('../../src/workspaces/service.js', () => ({
  resolveDefaultWorkspaceForAgent: routeMocks.resolveDefaultWorkspaceForAgent,
  assertWorkspaceMembership: vi.fn(),
}));

import { GET } from '../../app/api/agent/workflows/route.js';
import { POST as workflowAction } from '../../app/api/agent/workflows/[id]/actions/route.js';

const publicWorkflow = {
  id: 'workflow-public',
  agent_id: 'agent-source',
  workspace_id: 'workspace-source',
  project_id: 'project-source',
  name: 'Public launch workflow',
  summary: 'Checks launch readiness.',
  status: 'active',
  visibility: 'public',
  schedule: null,
  version: 3,
  steps: [{
    order: 1,
    tool: 'skill.launch',
    description: 'Run launch check',
    input: {
      projectId: 'project-source',
      vaultSecretId: 'secret-source',
      query: 'readiness',
    },
  }],
  graph_state: { nodes: [], edges: [] },
  code_state: null,
  canonical_doc: {},
};

function request(url: string, method = 'GET', body?: Record<string, unknown>) {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function listChain(data: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    },
  };
}

describe('workflow discovery routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.requireRouteCapability.mockResolvedValue({ agentId: 'agent-viewer', tier: 'retail_pro' });
    routeMocks.resolveDefaultWorkspaceForAgent.mockResolvedValue({ id: 'workspace-viewer' });
  });

  it('lists public workflows as non-monetized discoverable assets', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'agent_workflows') return listChain([publicWorkflow]);
      if (table === 'library_items') return listChain([
        { source_type: 'published_asset', source_id: 'workflow-public', metadata: { sourceType: 'workflow' } },
      ]);
      return listChain([]);
    });

    const response = await GET(request('http://localhost/api/agent/workflows?discover=public'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.discovery).toEqual(expect.objectContaining({
      mode: 'public_workflows',
      monetization: 'not_monetized',
    }));
    expect(body.workflows[0]).toEqual(expect.objectContaining({
      id: 'workflow-public',
      visibility: 'public',
      starred: true,
      monetization: 'not_monetized',
      requiresVaultConfiguration: true,
      privateContextRemoved: true,
    }));
    expect(body.workflows[0]).not.toHaveProperty('project_id');
    expect(body.workflows[0]).not.toHaveProperty('workspace_id');
  });

  it('forks public workflows into private sanitized Library assets', async () => {
    let insertedWorkflow: Record<string, unknown> | null = null;
    const libraryUpserts: Array<Record<string, unknown>> = [];

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'agent_workflows') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: publicWorkflow, error: null }),
          insert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
            insertedWorkflow = payload;
            return {
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: { id: 'workflow-fork', ...payload }, error: null }),
            };
          }),
        };
      }
      if (table === 'library_items') {
        return {
          upsert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
            libraryUpserts.push(payload);
            return { error: null };
          }),
        };
      }
      return listChain([]);
    });

    const response = await workflowAction(
      request('http://localhost/api/agent/workflows/workflow-public/actions', 'POST', { action: 'fork' }),
      { params: Promise.resolve({ id: 'workflow-public' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.forked).toBe(true);
    expect(insertedWorkflow).toEqual(expect.objectContaining({
      agent_id: 'agent-viewer',
      workspace_id: 'workspace-viewer',
      project_id: null,
      schedule: null,
      visibility: 'private',
      status: 'paused',
    }));
    expect(((insertedWorkflow?.steps as Array<Record<string, unknown>>)[0].input as Record<string, unknown>)).toEqual(expect.objectContaining({
      projectId: null,
      vaultSecretId: null,
      query: 'readiness',
    }));
    expect(libraryUpserts[0]).toEqual(expect.objectContaining({
      owner_agent_id: 'agent-viewer',
      source_type: 'forked_asset',
      source_id: 'workflow-fork',
      visibility: 'private',
      metadata: expect.objectContaining({
        originalWorkflowId: 'workflow-public',
        monetization: 'not_monetized',
        requiresVaultConfiguration: true,
        privateContextRemoved: true,
      }),
    }));
  });
});
