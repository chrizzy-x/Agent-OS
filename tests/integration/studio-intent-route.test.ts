import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createAgentToken } from '../../src/auth/agent-identity.js';

const intentRouteMocks = vi.hoisted(() => ({
  callClaude: vi.fn(),
  confirmTokenSet: vi.fn(),
  confirmTokenGet: vi.fn(),
  confirmTokenDel: vi.fn(),
  tokenSet: vi.fn(),
  tokenGet: vi.fn(),
  tokenDel: vi.fn(),
  executeUniversalToolCall: vi.fn(),
  registerExternalAgent: vi.fn(),
  requestExecutionAction: vi.fn(),
  updateExecution: vi.fn(),
  updateAgentTask: vi.fn(),
  listAgentApps: vi.fn(),
  publishAgentApp: vi.fn(),
  getSupabaseAdmin: vi.fn(),
}));

vi.mock('../../src/studio/planner.js', () => ({
  callClaude: intentRouteMocks.callClaude,
  tokenSet: intentRouteMocks.tokenSet,
  tokenGet: intentRouteMocks.tokenGet,
  tokenDel: intentRouteMocks.tokenDel,
  TOKEN_TTL_SECONDS: 1800,
}));

vi.mock('../../src/studio/confirm-tokens.js', () => ({
  tokenSet: intentRouteMocks.confirmTokenSet,
  tokenGet: intentRouteMocks.confirmTokenGet,
  tokenDel: intentRouteMocks.confirmTokenDel,
  TOKEN_TTL_SECONDS: 1800,
}));

vi.mock('../../src/mcp/registry.js', () => ({
  executeUniversalToolCall: intentRouteMocks.executeUniversalToolCall,
}));

vi.mock('../../src/external-agents/service.js', () => ({
  registerExternalAgent: intentRouteMocks.registerExternalAgent,
}));

vi.mock('../../src/execution/service.js', () => ({
  requestExecutionAction: intentRouteMocks.requestExecutionAction,
  updateExecution: intentRouteMocks.updateExecution,
}));

vi.mock('../../src/tasks/service.js', () => ({
  updateAgentTask: intentRouteMocks.updateAgentTask,
}));

vi.mock('../../src/appstore/service.js', () => ({
  listAgentApps: intentRouteMocks.listAgentApps,
  publishAgentApp: intentRouteMocks.publishAgentApp,
}));

vi.mock('../../src/storage/supabase.js', () => ({
  getSupabaseAdmin: intentRouteMocks.getSupabaseAdmin,
}));

import { POST } from '../../app/api/studio/intent/route.js';

describe('POST /api/studio/intent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    intentRouteMocks.confirmTokenGet.mockResolvedValue(null);
    intentRouteMocks.confirmTokenDel.mockResolvedValue(undefined);
    intentRouteMocks.tokenDel.mockResolvedValue(undefined);
    intentRouteMocks.tokenGet.mockResolvedValue(null);
    intentRouteMocks.requestExecutionAction.mockResolvedValue({
      id: 'execution-target',
      title: 'Execution target',
      status: 'COMPLETED',
    });
    intentRouteMocks.listAgentApps.mockResolvedValue([]);
    intentRouteMocks.publishAgentApp.mockResolvedValue({
      id: 'app-1',
      name: 'Quick Proof App',
      slug: 'quick-proof-app-1234abcd',
      visibility: 'private',
      published: false,
    });
    intentRouteMocks.getSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { tier: 'enterprise', metadata: { plan: 'enterprise_plus' } },
          error: null,
        }),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
      })),
    });
    intentRouteMocks.updateExecution.mockResolvedValue({});
    intentRouteMocks.updateAgentTask.mockResolvedValue({});
  });

  it('requires approval before Studio creates a real private app', async () => {
    const token = createAgentToken('agent-1', { expiresIn: '1h' });

    const response = await POST(new NextRequest('http://localhost/api/studio/intent', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Create private app Quick Proof App',
        sessionId: 'session-1',
        workspaceId: 'workspace-1',
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.kind).toBe('approval_required');
    expect(body.reply).toBe('Create private app Quick Proof App?');
    expect(body.confirmToken).toBeTruthy();
    expect(intentRouteMocks.confirmTokenSet).toHaveBeenCalledWith(
      expect.stringMatching(/^studio:confirm:/),
      1800,
      expect.stringContaining('"type":"app_create"'),
    );
    expect(intentRouteMocks.publishAgentApp).not.toHaveBeenCalled();
  });

  it('requires approval before Studio runs a Prime Agent command', async () => {
    const from = vi.fn((table: string) => {
      if (table === 'private_subagents') {
        const chain = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          order: vi.fn(() => chain),
          limit: vi.fn(() => Promise.resolve({
            data: [{ id: 'prime-agent-1', name: 'Proof Runner', workspace_id: 'workspace-1', project_id: null }],
            error: null,
          })),
        };
        return chain;
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { tier: 'enterprise', metadata: { plan: 'enterprise_plus' } },
          error: null,
        }),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
      };
    });
    intentRouteMocks.getSupabaseAdmin.mockReturnValue({ from });
    const token = createAgentToken('agent-1', { expiresIn: '1h' });

    const response = await POST(new NextRequest('http://localhost/api/studio/intent', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Run Prime Agent Proof Runner with tools list',
        sessionId: 'session-1',
        workspaceId: 'workspace-1',
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.kind).toBe('approval_required');
    expect(body.reply).toBe('Run Prime Agent Proof Runner with "tools list"?');
    expect(intentRouteMocks.confirmTokenSet).toHaveBeenCalledWith(
      expect.stringMatching(/^studio:confirm:/),
      1800,
      expect.stringContaining('"type":"prime_agent_command"'),
    );
  });

  it('resolves non-UUID Skill slugs before approval-backed Studio install', async () => {
    const token = createAgentToken('agent-1', { expiresIn: '1h' });
    const eq = vi.fn((_column: string, _value: string) => chain);
    const chain = {
      select: vi.fn(() => chain),
      eq,
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'skill-1', name: 'Proof Normalizer', slug: 'proof-normalizer-token' },
        error: null,
      }),
      ilike: vi.fn(() => chain),
    };
    intentRouteMocks.getSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => table === 'skills'
        ? chain
        : {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { tier: 'enterprise', metadata: { plan: 'enterprise_plus' } },
            error: null,
          }),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
        }),
    });

    const response = await POST(new NextRequest('http://localhost/api/studio/intent', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'install skill proof-normalizer-token',
        sessionId: 'session-1',
        workspaceId: 'workspace-1',
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.kind).toBe('approval_required');
    expect(body.reply).toBe('Install skill Proof Normalizer?');
    expect(eq).toHaveBeenCalledWith('slug', 'proof-normalizer-token');
    expect(intentRouteMocks.confirmTokenSet).toHaveBeenCalledWith(
      expect.stringMatching(/^studio:confirm:/),
      1800,
      expect.stringContaining('"type":"skill_install"'),
    );
  });

  it('creates the private app after approval', async () => {
    intentRouteMocks.confirmTokenGet.mockResolvedValue(JSON.stringify({
      type: 'app_create',
      agentId: 'agent-1',
      sessionId: 'session-1',
      workspaceId: 'workspace-1',
      name: 'Quick Proof App',
      slug: 'quick-proof-app-1234abcd',
      intent: 'APP_BUILD',
    }));
    const token = createAgentToken('agent-1', { expiresIn: '1h' });

    const response = await POST(new NextRequest('http://localhost/api/studio/intent', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ confirm: true, confirmToken: 'confirm-token', sessionId: 'session-1' }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.kind).toBe('completed');
    expect(body.executed).toBe(true);
    expect(body.reply).toBe('Created private app Quick Proof App.');
    expect(body.navigateTo).toBe('/appstore/quick-proof-app-1234abcd');
    expect(intentRouteMocks.publishAgentApp).toHaveBeenCalledWith(expect.objectContaining({
      publisherId: 'agent-1',
      workspaceId: 'workspace-1',
      name: 'Quick Proof App',
      slug: 'quick-proof-app-1234abcd',
      visibility: 'private',
      published: false,
      manifest: expect.objectContaining({
        runtime: 'agentos-app',
        entrypoint: 'agentos://apps/quick-proof-app-1234abcd',
      }),
    }));
  });

  it('redacts secret-like tool output before returning confirmed intent results', async () => {
    intentRouteMocks.tokenGet.mockResolvedValue(JSON.stringify({
      summary: 'Read memory',
      steps: [{ order: 1, tool: 'agentos.mem_get', input: { key: 'demo' }, description: 'Read memory' }],
      schedule: null,
      workflowName: 'Read memory',
      agentId: 'agent-1',
    }));
    intentRouteMocks.executeUniversalToolCall.mockResolvedValue('OPENAI_API_KEY=sk-live-secret-value');

    const token = createAgentToken('agent-1', { expiresIn: '1h' });
    const request = new NextRequest('http://localhost/api/studio/intent', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        confirm: true,
        confirmToken: 'confirm-token',
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.executed).toBe(true);
    expect(body.results[0].result).toBe('OPENAI_API_KEY=[redacted]');
    expect(String(body.answer)).toContain('[redacted]');
    expect(String(body.answer)).not.toContain('sk-live-secret-value');
  });

  it('consumes approval tokens before execution and rejects replay', async () => {
    const pending = {
      type: 'workflow_plan',
      summary: 'Read memory',
      steps: [{ order: 1, tool: 'agentos.mem_get', input: { key: 'demo' }, description: 'Read memory' }],
      schedule: null,
      workflowName: 'Read memory',
      agentId: 'agent-1',
      sessionId: null,
      workspaceId: null,
      projectId: null,
      plan: {
        summary: 'Read memory',
        steps: [{ order: 1, tool: 'agentos.mem_get', input: { key: 'demo' }, description: 'Read memory' }],
        schedule: null,
      },
      intent: 'WORKFLOW_EXECUTION',
    };
    intentRouteMocks.confirmTokenGet
      .mockResolvedValueOnce(JSON.stringify(pending))
      .mockResolvedValueOnce(null);
    intentRouteMocks.executeUniversalToolCall.mockResolvedValue('memory value');
    const token = createAgentToken('agent-1', { expiresIn: '1h' });

    const first = await POST(new NextRequest('http://localhost/api/studio/intent', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ confirm: true, confirmToken: 'confirm-token' }),
    }));
    const second = await POST(new NextRequest('http://localhost/api/studio/intent', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ confirm: true, confirmToken: 'confirm-token' }),
    }));
    const replayBody = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(400);
    expect(replayBody.reply).toContain('Approval expired');
    expect(intentRouteMocks.confirmTokenDel).toHaveBeenCalledWith('studio:confirm:confirm-token');
    expect(intentRouteMocks.executeUniversalToolCall).toHaveBeenCalledTimes(1);
    expect(intentRouteMocks.confirmTokenDel.mock.invocationCallOrder[0]).toBeLessThan(
      intentRouteMocks.executeUniversalToolCall.mock.invocationCallOrder[0],
    );
  });

  it('marks streamed approval tasks and executions complete after approval execution succeeds', async () => {
    intentRouteMocks.confirmTokenGet.mockResolvedValue(JSON.stringify({
      type: 'workflow_plan',
      agentId: 'agent-1',
      runtimeTaskId: 'task-stream',
      runtimeExecutionId: 'execution-stream',
      sessionId: null,
      workspaceId: null,
      projectId: null,
      workflowName: 'Read memory',
      plan: {
        summary: 'Read memory',
        steps: [{ order: 1, tool: 'agentos.mem_get', input: { key: 'demo' }, description: 'Read memory' }],
        schedule: null,
      },
      intent: 'WORKFLOW_EXECUTION',
    }));
    intentRouteMocks.executeUniversalToolCall.mockResolvedValue('memory value');
    const token = createAgentToken('agent-1', { expiresIn: '1h' });

    const response = await POST(new NextRequest('http://localhost/api/studio/intent', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ confirm: true, confirmToken: 'confirm-token' }),
    }));

    expect(response.status).toBe(200);
    expect(intentRouteMocks.updateExecution).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'agent-1',
      executionId: 'execution-stream',
      patch: expect.objectContaining({
        status: 'COMPLETED',
        completedAt: expect.any(String),
      }),
    }));
    expect(intentRouteMocks.updateAgentTask).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'agent-1',
      taskId: 'task-stream',
      patch: expect.objectContaining({
        status: 'completed',
        confirmationStatus: 'approved',
        progress: 100,
      }),
    }));
  });
});
