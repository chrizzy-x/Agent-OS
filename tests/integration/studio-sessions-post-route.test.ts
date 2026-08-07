import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const routeMocks = vi.hoisted(() => ({
  requireRouteCapability: vi.fn(),
  reconcileAgentOSProvisioning: vi.fn(),
  resolveProjectForWorkspace: vi.fn(),
  resolveDefaultWorkspaceForAgent: vi.fn(),
  createStudioSession: vi.fn(),
  listStudioSessions: vi.fn(),
  setStudioSessionIntelligence: vi.fn(),
}));

vi.mock('../../src/auth/request.js', () => ({
  requireRouteCapability: routeMocks.requireRouteCapability,
}));

vi.mock('../../src/agentos/provisioning.js', () => ({
  reconcileAgentOSProvisioning: routeMocks.reconcileAgentOSProvisioning,
}));

vi.mock('../../src/projects/service.js', () => ({
  resolveProjectForWorkspace: routeMocks.resolveProjectForWorkspace,
}));

vi.mock('../../src/workspaces/service.js', () => ({
  resolveDefaultWorkspaceForAgent: routeMocks.resolveDefaultWorkspaceForAgent,
}));

vi.mock('../../src/studio/persistence.js', () => ({
  createStudioSession: routeMocks.createStudioSession,
  listStudioSessions: routeMocks.listStudioSessions,
}));

vi.mock('../../src/intelligence/service.js', () => ({
  setStudioSessionIntelligence: routeMocks.setStudioSessionIntelligence,
}));

import { POST } from '../../app/api/studio/sessions/route.js';

describe('POST /api/studio/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    routeMocks.requireRouteCapability.mockResolvedValue({ agentId: 'agent-1' });
    routeMocks.resolveProjectForWorkspace.mockResolvedValue({ id: 'project-1', workspaceId: 'workspace-1' });
    routeMocks.createStudioSession.mockResolvedValue({
      id: 'session-1',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      ownerAgentId: 'agent-1',
      superAgentId: null,
      visibility: 'private',
      parentSessionId: null,
      parentSnapshotId: null,
      branchLabel: null,
      linkedSubagentId: null,
      linkedWorkflowId: null,
      linkedAppId: null,
      linkedFilePaths: [],
      linkedMemoryRefs: [],
      title: 'Proof session',
      status: 'active',
      pinnedAt: null,
      archivedAt: null,
      deletedAt: null,
      state: {},
      createdAt: '2026-08-07T00:00:00.000Z',
      updatedAt: '2026-08-07T00:00:00.000Z',
    });
    routeMocks.setStudioSessionIntelligence.mockResolvedValue({
      selection: {
        mode: 'native',
        connectionId: null,
        modelId: null,
        consensusConfigurationId: null,
        selectionSource: 'session',
      },
    });
  });

  it('uses real Studio persistence fallback in production when direct REST storage is unavailable', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rest unavailable')));

    try {
      const response = await POST(new NextRequest('http://localhost/api/studio/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'workspace-1',
          projectId: 'project-1',
          title: 'Proof session',
        }),
      }));
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.session.id).toBe('session-1');
      expect(routeMocks.createStudioSession).toHaveBeenCalledWith(expect.objectContaining({
        ownerAgentId: 'agent-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
      }));
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });
});
