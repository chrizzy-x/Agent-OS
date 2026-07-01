import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAgentContextWithTier: vi.fn(),
  buildWorkspaceContextPackage: vi.fn(),
  createAgentTask: vi.fn(),
  updateAgentTask: vi.fn(),
}));

vi.mock('../../src/auth/request.js', () => ({
  requireAgentContextWithTier: mocks.requireAgentContextWithTier,
}));

vi.mock('../../src/workspace-context/service.js', () => ({
  buildWorkspaceContextPackage: mocks.buildWorkspaceContextPackage,
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
    mocks.buildWorkspaceContextPackage.mockResolvedValue({
      capabilityGraph: {
        availableCapabilities: [],
        needsConfiguration: [],
        unavailableCapabilities: [],
        summary: {
          total: 0,
          available: 0,
          needsConfiguration: 0,
          disabled: 0,
          error: 0,
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
    });
    mocks.createAgentTask.mockResolvedValue({ id: 'task-1', metadata: {} });
    mocks.updateAgentTask.mockImplementation(async ({ patch }) => ({ id: 'task-1', ...patch }));
  });

  it('does not mark a routed-only message as completed execution', async () => {
    const response = await POST(new NextRequest('http://localhost/api/super-agent/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'research AI agents and save it' }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.updateAgentTask).toHaveBeenCalledWith(expect.objectContaining({
      patch: expect.objectContaining({
        status: 'needs_configuration',
        errorMessage: 'No executable capability action was selected.',
      }),
    }));
    expect(body.task.status).toBe('needs_configuration');
  });
});
