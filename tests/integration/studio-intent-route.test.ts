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
    intentRouteMocks.updateExecution.mockResolvedValue({});
    intentRouteMocks.updateAgentTask.mockResolvedValue({});
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
