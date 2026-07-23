import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireRouteCapability: vi.fn(),
  appendExecutionLog: vi.fn(),
  createExecution: vi.fn(),
  updateExecution: vi.fn(),
  createNotification: vi.fn(),
  listProjects: vi.fn(),
  streamStudioChatReply: vi.fn(),
  detectAgentOSIntent: vi.fn(),
  humanStatusForIntent: vi.fn(),
  translateMessageToStudioCommand: vi.fn(),
  appendStudioEvent: vi.fn(),
  appendStudioMessage: vi.fn(),
  getStudioSessionBundle: vi.fn(),
  createAgentTask: vi.fn(),
  updateAgentTask: vi.fn(),
  listVaultSecrets: vi.fn(),
  buildWorkspaceContextPackage: vi.fn(),
  listWorkspaces: vi.fn(),
}));

vi.mock('../../src/auth/request.js', () => ({
  requireRouteCapability: mocks.requireRouteCapability,
}));
vi.mock('../../src/execution/service.js', () => ({
  appendExecutionLog: mocks.appendExecutionLog,
  createExecution: mocks.createExecution,
  updateExecution: mocks.updateExecution,
}));
vi.mock('../../src/notifications/service.js', () => ({
  createNotification: mocks.createNotification,
}));
vi.mock('../../src/projects/service.js', () => ({
  listProjects: mocks.listProjects,
}));
vi.mock('../../src/studio/conversation.js', () => ({
  streamStudioChatReply: mocks.streamStudioChatReply,
}));
vi.mock('../../src/studio/intents.js', () => ({
  detectAgentOSIntent: mocks.detectAgentOSIntent,
  humanStatusForIntent: mocks.humanStatusForIntent,
  translateMessageToStudioCommand: mocks.translateMessageToStudioCommand,
}));
vi.mock('../../src/studio/persistence.js', () => ({
  appendStudioEvent: mocks.appendStudioEvent,
  appendStudioMessage: mocks.appendStudioMessage,
  getStudioSessionBundle: mocks.getStudioSessionBundle,
}));
vi.mock('../../src/tasks/service.js', () => ({
  createAgentTask: mocks.createAgentTask,
  updateAgentTask: mocks.updateAgentTask,
}));
vi.mock('../../src/vault/service.js', () => ({
  listVaultSecrets: mocks.listVaultSecrets,
}));
vi.mock('../../src/workspace-context/service.js', () => ({
  buildWorkspaceContextPackage: mocks.buildWorkspaceContextPackage,
}));
vi.mock('../../src/workspaces/service.js', () => ({
  listWorkspaces: mocks.listWorkspaces,
}));

import { POST } from '../../app/api/studio/intent/stream/route.js';

describe('POST /api/studio/intent/stream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRouteCapability.mockResolvedValue({ agentId: 'agent-1' });
    mocks.createExecution.mockResolvedValue({ id: 'execution-1' });
    mocks.updateExecution.mockResolvedValue({});
    mocks.appendExecutionLog.mockResolvedValue({});
    mocks.createNotification.mockResolvedValue({});
    mocks.detectAgentOSIntent.mockResolvedValue('NORMAL_CHAT');
    mocks.humanStatusForIntent.mockReturnValue('Thinking...');
    mocks.translateMessageToStudioCommand.mockReturnValue(null);
    mocks.appendStudioEvent.mockResolvedValue({});
    mocks.appendStudioMessage.mockResolvedValue({});
    mocks.createAgentTask.mockResolvedValue({ id: 'task-1', metadata: {} });
    mocks.updateAgentTask.mockResolvedValue({});
    mocks.listVaultSecrets.mockResolvedValue({ secrets: [] });
    mocks.buildWorkspaceContextPackage.mockResolvedValue({
      metadata: { contextVersion: 'context-v1' },
      capabilityGraph: {
        graphVersion: 'graph-v1',
        summary: { available: 0, needsConfiguration: 0, error: 0, bySourceType: {} },
        availableCapabilities: [],
        needsConfiguration: [],
      },
      runtimeRegistry: {
        contract: {
          runtime: 'super-agentos',
          plannerVersion: 'planner-v1',
          selectionPolicy: 'native_first',
        },
      },
    });
    mocks.getStudioSessionBundle.mockResolvedValue({
      session: {
        id: 'session-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        title: 'Chat',
      },
    });
    mocks.listWorkspaces.mockResolvedValue([{ id: 'workspace-1', name: 'Workspace' }]);
    mocks.listProjects.mockResolvedValue([{ id: 'project-1', name: 'Project' }]);
  });

  it('streams deltas and persists one user and assistant turn', async () => {
    mocks.streamStudioChatReply.mockImplementation(async ({ onDelta }) => {
      await onDelta('Hel');
      await onDelta('lo');
      return 'Hello';
    });

    const response = await POST(new NextRequest('http://localhost/api/studio/intent/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Hi',
        sessionId: 'session-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
      }),
    }));
    const body = await response.text();

    expect(body).toContain('event: execution');
    expect(body).toContain('event: status');
    expect(body).toContain('"providerMode":"native"');
    expect(body).toContain('"providerLabel":"Super AgentOS"');
    expect(body).toContain('"executionTarget":"Super AgentOS"');
    expect(body).toContain('data: {"text":"Hel"}');
    expect(body).toContain('data: {"text":"lo"}');
    expect(body).toContain('"status":"COMPLETED"');
    expect(mocks.appendStudioMessage).toHaveBeenCalledTimes(2);
    expect(mocks.appendStudioMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({
      role: 'user',
      content: 'Hi',
    }));
    expect(mocks.appendStudioMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({
      role: 'assistant',
      content: 'Hello',
    }));
    expect(mocks.createExecution).toHaveBeenCalledWith(expect.objectContaining({
      model: 'super-agentos:native',
      metadata: expect.objectContaining({
        provider: expect.objectContaining({
          mode: 'native',
          label: 'Super AgentOS',
        }),
        executionTarget: expect.objectContaining({
          selected: 'super_agentos',
          displayName: 'Super AgentOS',
        }),
      }),
    }));
    expect(mocks.appendExecutionLog).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Super AgentOS request started',
      data: expect.objectContaining({
        providerMode: 'native',
        executionTarget: 'Super AgentOS',
      }),
    }));
  });

  it('keeps and persists partial output when aborted', async () => {
    const abortController = new AbortController();
    mocks.streamStudioChatReply.mockImplementation(async ({ onDelta }) => {
      await onDelta('Partial');
      abortController.abort();
      throw new DOMException('Aborted', 'AbortError');
    });

    const response = await POST(new NextRequest('http://localhost/api/studio/intent/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Long answer', sessionId: 'session-1' }),
      signal: abortController.signal,
    }));
    const body = await response.text();

    expect(body).toContain('data: {"text":"Partial"}');
    expect(mocks.appendStudioMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      role: 'assistant',
      content: 'Partial',
    }));
    expect(mocks.updateExecution).toHaveBeenLastCalledWith(expect.objectContaining({
      patch: expect.objectContaining({ status: 'CANCELLED' }),
    }));
  });

  it('answers provider status questions from runtime configuration', async () => {
    const response = await POST(new NextRequest('http://localhost/api/studio/intent/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Can I talk to Super Agent now? Is Super Agent live?',
        sessionId: 'session-1',
        workspaceId: 'workspace-1',
      }),
    }));
    const body = await response.text();

    expect(body).toContain('Super AgentOS is running on the native AgentOS ');
    expect(body).toContain('runtime.');
    expect(body).toContain('External intelligence is optional');
    expect(body).toContain('Connect a ');
    expect(body).toContain('provider through Vault when you want BYOK ');
    expect(mocks.streamStudioChatReply).not.toHaveBeenCalled();
  });

  it('returns a generic error without exposing the thrown message', async () => {
    mocks.streamStudioChatReply.mockRejectedValue(new Error('secret provider stack'));

    const response = await POST(new NextRequest('http://localhost/api/studio/intent/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hi', sessionId: 'session-1' }),
    }));
    const body = await response.text();

    expect(body).toContain('I could not complete that response. Try again.');
    expect(body).not.toContain('secret provider stack');
    expect(body).not.toContain('whatFailed');
  });
});
