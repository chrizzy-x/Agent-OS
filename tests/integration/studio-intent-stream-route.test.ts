import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireRouteCapability: vi.fn(),
  appendExecutionLog: vi.fn(),
  createExecution: vi.fn(),
  updateExecution: vi.fn(),
  requestStandardConsensusProposalOnly: vi.fn(),
  runStandardConsensusRuntime: vi.fn(),
  runSingleIntelligenceRuntime: vi.fn(),
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
vi.mock('../../src/intelligence/consensus.js', () => ({
  requestStandardConsensusProposalOnly: mocks.requestStandardConsensusProposalOnly,
  runStandardConsensusRuntime: mocks.runStandardConsensusRuntime,
}));
vi.mock('../../src/intelligence/runtime.js', () => ({
  runSingleIntelligenceRuntime: mocks.runSingleIntelligenceRuntime,
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
    mocks.requireRouteCapability.mockResolvedValue({
      agentId: 'agent-1',
      allowedDomains: [],
      quotas: {
        storageQuotaBytes: 1024,
        memoryQuotaBytes: 1024,
        rateLimitPerMin: 100,
      },
      tier: 'retail_free',
    });
    mocks.createExecution.mockResolvedValue({ id: 'execution-1' });
    mocks.updateExecution.mockResolvedValue({});
    mocks.runStandardConsensusRuntime.mockResolvedValue({
      text: 'Standard Consensus response',
      record: {
        id: 'consensus-record-1',
        consensusConfigurationId: 'standard',
        consensusHash: 'consensus-hash',
        usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
      },
      workerRun: { id: 'worker-run-1' },
      trace: {
        kind: 'standard_consensus',
        status: 'completed',
        executionAuthority: 'super_agentos',
        connectedIntelligenceRole: 'proposal_only',
        consensusRecordId: 'consensus-record-1',
        workerRunId: 'worker-run-1',
        consensusConfigurationId: 'standard',
        consensusHash: 'consensus-hash',
        proposalHash: 'consensus-hash',
        proposalPreview: 'Standard Consensus response',
        workerCount: 2,
        dissentCount: 1,
        usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
      },
    });
    mocks.requestStandardConsensusProposalOnly.mockResolvedValue({
      text: 'Standard Consensus proposal',
      trace: {
        kind: 'standard_consensus',
        status: 'completed',
        executionAuthority: 'super_agentos',
        connectedIntelligenceRole: 'proposal_only',
        consensusRecordId: 'consensus-record-2',
        workerRunId: 'worker-run-2',
        consensusConfigurationId: 'standard',
        consensusHash: 'consensus-hash-2',
        proposalHash: 'consensus-hash-2',
        proposalPreview: 'Standard Consensus proposal',
        workerCount: 2,
        dissentCount: 1,
        usage: { inputTokens: 5, outputTokens: 6, totalTokens: 11 },
      },
    });
    mocks.runSingleIntelligenceRuntime.mockResolvedValue({
      text: 'Connected response',
      invocation: { id: 'invocation-1' },
      connection: { id: 'connection-1', vendor: 'openai' },
      modelId: 'gpt-5',
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3, raw: {} },
      finishReason: 'completed',
    });
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

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it('streams through the selected single intelligence runtime without native fallback', async () => {
    mocks.runSingleIntelligenceRuntime.mockImplementation(async ({ onDelta }) => {
      await onDelta('Connected ');
      await onDelta('response');
      return {
        text: 'Connected response',
        invocation: { id: 'invocation-1' },
        connection: { id: 'connection-1', vendor: 'openai' },
        modelId: 'gpt-5',
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3, raw: {} },
        finishReason: 'completed',
      };
    });

    const response = await POST(new NextRequest('http://localhost/api/studio/intent/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Use selected model',
        sessionId: 'session-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        intelligenceSelection: {
          mode: 'single',
          connectionId: 'connection-1',
          modelId: 'gpt-5',
          consensusConfigurationId: null,
          selectionSource: 'message',
        },
      }),
    }));
    const body = await response.text();

    expect(body).toContain('Calling selected connected intelligence');
    expect(body).toContain('data: {"text":"Connected "}');
    expect(body).toContain('data: {"text":"response"}');
    expect(body).toContain('"status":"COMPLETED"');
    expect(mocks.runSingleIntelligenceRuntime).toHaveBeenCalledWith(expect.objectContaining({
      ownerAgentId: 'agent-1',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      sessionId: 'session-1',
      executionId: 'execution-1',
      selection: expect.objectContaining({
        mode: 'single',
        connectionId: 'connection-1',
        modelId: 'gpt-5',
      }),
    }));
    expect(mocks.streamStudioChatReply).not.toHaveBeenCalled();
  });

  it('surfaces selected connected credential rejection without native fallback', async () => {
    mocks.runSingleIntelligenceRuntime.mockRejectedValue(new Error('Connected intelligence request failed with status 401.'));

    const response = await POST(new NextRequest('http://localhost/api/studio/intent/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Use selected model',
        sessionId: 'session-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        intelligenceSelection: {
          mode: 'single',
          connectionId: 'connection-1',
          modelId: 'gpt-5',
          consensusConfigurationId: null,
          selectionSource: 'message',
        },
      }),
    }));
    const body = await response.text();

    expect(body).toContain('credential was rejected by the provider');
    expect(body).toContain('No silent fallback was used.');
    expect(body).toContain('"status":"FAILED"');
    expect(mocks.streamStudioChatReply).not.toHaveBeenCalled();
    expect(mocks.appendStudioMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      role: 'assistant',
      content: expect.stringContaining('credential was rejected by the provider'),
    }));
  });

  it('streams Standard Consensus direct conversation results without native fallback', async () => {
    const response = await POST(new NextRequest('http://localhost/api/studio/intent/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Compare options',
        sessionId: 'session-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        intelligenceSelection: {
          mode: 'consensus',
          connectionId: null,
          modelId: null,
          consensusConfigurationId: 'standard',
          selectionSource: 'message',
        },
      }),
    }));
    const body = await response.text();

    expect(body).toContain('Running Standard Consensus');
    expect(body).toContain('Standard Consensus response');
    expect(body).toContain('"status":"COMPLETED"');
    expect(mocks.runStandardConsensusRuntime).toHaveBeenCalledWith(expect.objectContaining({
      ownerAgentId: 'agent-1',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      selection: expect.objectContaining({
        mode: 'consensus',
        consensusConfigurationId: 'standard',
      }),
    }));
    expect(mocks.updateExecution).toHaveBeenCalledWith(expect.objectContaining({
      patch: expect.objectContaining({
        output: expect.objectContaining({
          intelligenceInvocation: expect.objectContaining({
            kind: 'standard_consensus',
            consensusRecordId: 'consensus-record-1',
            workerRunId: 'worker-run-1',
          }),
        }),
      }),
    }));
    expect(mocks.streamStudioChatReply).not.toHaveBeenCalled();
    expect(mocks.runSingleIntelligenceRuntime).not.toHaveBeenCalled();
  });

  it('uses connected intelligence as proposal-only before AgentOS approval routing', async () => {
    mocks.detectAgentOSIntent.mockResolvedValue('PROJECT_TASK');
    mocks.runSingleIntelligenceRuntime.mockResolvedValue({
      text: 'Propose creating the project after approval.',
      invocation: { id: 'invocation-2' },
      connection: { id: 'connection-1', vendor: 'openai' },
      modelId: 'gpt-5',
      usage: { inputTokens: 4, outputTokens: 5, totalTokens: 9, raw: {} },
      finishReason: 'stop',
      purpose: 'proposal_only',
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      kind: 'approval_required',
      intent: 'PROJECT_TASK',
      statusText: 'Approval required.',
      reply: 'Create project Launch Plan?',
      confirmToken: 'confirm-1',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(new NextRequest('http://localhost/api/studio/intent/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'agent_access=session-token',
        'Content-Length': '9999',
      },
      body: JSON.stringify({
        message: 'Create project Launch Plan',
        sessionId: 'session-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        intelligenceSelection: {
          mode: 'single',
          connectionId: 'connection-1',
          modelId: 'gpt-5',
          consensusConfigurationId: null,
          selectionSource: 'message',
        },
      }),
    }));
    const body = await response.text();
    const forwarded = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as Record<string, unknown>;
    const forwardedHeaders = fetchMock.mock.calls[0][1]?.headers as Headers;

    expect(body).toContain('Requesting connected proposal for Super AgentOS validation');
    expect(body).toContain('Create project Launch Plan?');
    expect(body).toContain('"status":"PAUSED"');
    expect(body).not.toContain('Propose creating the project');
    expect(mocks.runSingleIntelligenceRuntime).toHaveBeenCalledWith(expect.objectContaining({
      purpose: 'proposal_only',
      message: expect.stringContaining('Proposal-only review for Super AgentOS validation.'),
    }));
    expect(forwarded.message).toBe('Create project Launch Plan');
    expect(forwarded.runtimeTaskId).toBe('task-1');
    expect(forwarded.runtimeExecutionId).toBe('execution-1');
    expect(forwardedHeaders.get('cookie')).toBe('agent_access=session-token');
    expect(forwardedHeaders.has('content-length')).toBe(false);
    expect(forwarded.intelligenceProposal).toEqual(expect.objectContaining({
      kind: 'connected_proposal',
      invocationId: 'invocation-2',
      executionAuthority: 'super_agentos',
      connectedIntelligenceRole: 'proposal_only',
    }));
    expect(mocks.appendExecutionLog).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Connected intelligence proposal recorded for Super AgentOS validation',
    }));
    expect(mocks.updateExecution).toHaveBeenCalledWith(expect.objectContaining({
      patch: expect.objectContaining({
        status: 'PAUSED',
        output: expect.objectContaining({
          mixedExecution: expect.objectContaining({
            executionAuthority: 'super_agentos',
            connectedProposalUsedForExecution: false,
            originalRequestUsedForExecution: true,
            approvalRequired: true,
            resultVerification: 'pending_user_approval',
          }),
        }),
      }),
    }));
    expect(mocks.streamStudioChatReply).not.toHaveBeenCalled();
  });

  it('uses Standard Consensus as proposal-only before AgentOS approval routing', async () => {
    mocks.detectAgentOSIntent.mockResolvedValue('PROJECT_TASK');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      kind: 'approval_required',
      intent: 'PROJECT_TASK',
      statusText: 'Approval required.',
      reply: 'Create project Launch Plan?',
      confirmToken: 'confirm-1',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(new NextRequest('http://localhost/api/studio/intent/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Create project Launch Plan',
        sessionId: 'session-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        intelligenceSelection: {
          mode: 'consensus',
          connectionId: null,
          modelId: null,
          consensusConfigurationId: 'standard',
          selectionSource: 'message',
        },
      }),
    }));
    const body = await response.text();
    const forwarded = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as Record<string, unknown>;

    expect(body).toContain('Requesting Standard Consensus proposal for Super AgentOS validation');
    expect(body).toContain('"status":"PAUSED"');
    expect(forwarded.runtimeTaskId).toBe('task-1');
    expect(forwarded.runtimeExecutionId).toBe('execution-1');
    expect(forwarded.intelligenceProposal).toEqual(expect.objectContaining({
      kind: 'standard_consensus',
      consensusRecordId: 'consensus-record-2',
      executionAuthority: 'super_agentos',
      connectedIntelligenceRole: 'proposal_only',
      dissentCount: 1,
    }));
    expect(mocks.requestStandardConsensusProposalOnly).toHaveBeenCalledWith(expect.objectContaining({
      ownerAgentId: 'agent-1',
      workspaceId: 'workspace-1',
      intent: 'PROJECT_TASK',
    }));
    expect(mocks.appendExecutionLog).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Standard Consensus proposal recorded for Super AgentOS validation',
    }));
    expect(mocks.updateExecution).toHaveBeenCalledWith(expect.objectContaining({
      patch: expect.objectContaining({
        output: expect.objectContaining({
          mixedExecution: expect.objectContaining({
            connectedProposalUsedForExecution: false,
            originalRequestUsedForExecution: true,
            proposalInvocationId: 'consensus-record-2',
          }),
        }),
      }),
    }));
    expect(mocks.runSingleIntelligenceRuntime).not.toHaveBeenCalled();
  });

  it('persists non-chat Studio task prompts before approval routing', async () => {
    mocks.detectAgentOSIntent.mockResolvedValue('APP_BUILD');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      kind: 'approval_required',
      intent: 'APP_BUILD',
      statusText: 'Approval required.',
      reply: 'Create private app Quick Proof App?',
      confirmToken: 'confirm-1',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(new NextRequest('http://localhost/api/studio/intent/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Create private app Quick Proof App',
        sessionId: 'session-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
      }),
    }));
    const body = await response.text();

    expect(body).toContain('Create private app Quick Proof App?');
    expect(body).toContain('"status":"PAUSED"');
    expect(mocks.appendStudioMessage).toHaveBeenCalledWith(expect.objectContaining({
      ownerAgentId: 'agent-1',
      sessionId: 'session-1',
      role: 'user',
      content: 'Create private app Quick Proof App',
    }));
    expect(fetchMock).toHaveBeenCalled();
  });

  it('returns missing capability for paper trading before expensive runtime context', async () => {
    const response = await POST(new NextRequest('http://localhost/api/studio/intent/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Paper trade 1 share of AAPL without Derek using a non-Derek broker.',
        sessionId: 'session-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
      }),
    }));
    const body = await response.text();

    expect(body).toContain('Missing capability');
    expect(body).toContain('No order was placed');
    expect(body).toContain('"status":"COMPLETED"');
    expect(mocks.buildWorkspaceContextPackage).not.toHaveBeenCalled();
    expect(mocks.streamStudioChatReply).not.toHaveBeenCalled();
    expect(mocks.appendStudioMessage).toHaveBeenCalledWith(expect.objectContaining({
      role: 'user',
      content: 'Paper trade 1 share of AAPL without Derek using a non-Derek broker.',
    }));
    expect(mocks.appendStudioMessage).toHaveBeenCalledWith(expect.objectContaining({
      role: 'assistant',
      content: expect.stringContaining('No order was placed'),
    }));
    expect(mocks.createExecution).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        missingCapability: 'non_derek_paper_broker_execution',
      }),
    }));
    expect(mocks.updateExecution).toHaveBeenCalledWith(expect.objectContaining({
      patch: expect.objectContaining({
        output: expect.objectContaining({
          code: 'MISSING_CAPABILITY',
          executed: false,
        }),
      }),
    }));
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
