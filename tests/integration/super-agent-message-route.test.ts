import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAgentContextWithTier: vi.fn(),
  buildWorkspaceContextPackage: vi.fn(),
  detectAgentOSIntent: vi.fn(),
  generateStudioChatReply: vi.fn(),
  getStudioProviderStatus: vi.fn(),
  createAgentTask: vi.fn(),
  updateAgentTask: vi.fn(),
}));

vi.mock('../../src/auth/request.js', () => ({
  requireAgentContextWithTier: mocks.requireAgentContextWithTier,
}));

vi.mock('../../src/workspace-context/service.js', () => ({
  buildWorkspaceContextPackage: mocks.buildWorkspaceContextPackage,
}));

vi.mock('../../src/studio/conversation.js', () => ({
  generateStudioChatReply: mocks.generateStudioChatReply,
}));

vi.mock('../../src/studio/intents.js', () => ({
  detectAgentOSIntent: mocks.detectAgentOSIntent,
}));

vi.mock('../../src/studio/providers.js', () => ({
  getStudioProviderStatus: mocks.getStudioProviderStatus,
}));

vi.mock('../../src/tasks/service.js', () => ({
  createAgentTask: mocks.createAgentTask,
  updateAgentTask: mocks.updateAgentTask,
}));

import { POST } from '../../app/api/super-agent/message/route.js';

describe('POST /api/super-agent/message', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAgentContextWithTier.mockResolvedValue({ agentId: 'agent-1', tier: 'retail_pro' });
    mocks.detectAgentOSIntent.mockResolvedValue('RESEARCH');
    mocks.generateStudioChatReply.mockResolvedValue('Provider-backed Super AgentOS answer.');
    mocks.getStudioProviderStatus.mockReturnValue({
      configured: true,
      provider: 'openai',
      model: 'gpt-test',
      label: 'OpenAI gpt-test',
      mode: 'external',
      message: 'Development external intelligence override is configured.',
    });
    mocks.buildWorkspaceContextPackage.mockResolvedValue({
      metadata: {
        contextVersion: 'ctx-test',
        dependencyHash: 'hash-test',
        sourcesUsed: [],
      },
      capabilityGraph: {
        graphVersion: 'capgraph-test',
        availableCapabilities: [],
        needsConfiguration: [],
        unavailableCapabilities: [],
        relationships: [],
        summary: {
          total: 0,
          available: 0,
          needsConfiguration: 0,
          disabled: 0,
          error: 0,
          registryAssets: 0,
          healthy: 0,
          warning: 0,
          bySourceType: {
            system: 0,
            app: 0,
            skill: 0,
            workflow: 0,
            subagent: 0,
            mcp: 0,
            project: 0,
            library: 0,
          },
        },
      },
      runtimeRegistry: {
        assets: [],
        graphVersion: 'capgraph-test',
        contract: {
          runtime: 'super-agentos',
          version: '6.6.8',
          plannerVersion: 'super-agentos-planner-v6.6.8',
          registryVersion: '6.6.8',
          selectionPolicy: 'deterministic-health-permission-rank',
        },
      },
    });
    mocks.createAgentTask.mockResolvedValue({ id: 'task-1', metadata: {} });
    mocks.updateAgentTask.mockImplementation(async ({ patch }) => ({ id: 'task-1', ...patch }));
  });

  it('answers normal messages through the Studio provider path without exposing raw context', async () => {
    const response = await POST(new NextRequest('http://localhost/api/super-agent/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'research AI agents and save it' }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.detectAgentOSIntent).toHaveBeenCalledWith('research AI agents and save it');
    expect(mocks.generateStudioChatReply).toHaveBeenCalledWith({
      message: 'research AI agents and save it',
      intent: 'RESEARCH',
      executionTargetId: 'super_agentos',
    });
    expect(mocks.updateAgentTask).toHaveBeenCalledWith(expect.objectContaining({
      patch: expect.objectContaining({
        status: 'completed',
        resultSummary: 'Provider-backed Super AgentOS answer.',
        errorMessage: null,
      }),
    }));
    expect(body.reply).toBe('Provider-backed Super AgentOS answer.');
    expect(body.task.status).toBe('completed');
    expect(body.contextSummary).toEqual(expect.objectContaining({
      contextVersion: 'ctx-test',
      graphVersion: 'capgraph-test',
    }));
    expect(body.workspaceContext).toBeUndefined();
  });

  it('answers provider status questions deterministically', async () => {
    const response = await POST(new NextRequest('http://localhost/api/super-agent/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'can i talk to super agent now?' }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.detectAgentOSIntent).not.toHaveBeenCalled();
    expect(mocks.generateStudioChatReply).not.toHaveBeenCalled();
    expect(body.reply).toContain('development external intelligence override');
    expect(body.providerStatus).toEqual(expect.objectContaining({
      configured: true,
      label: 'OpenAI gpt-test',
    }));
  });
});
