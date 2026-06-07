import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const routeMocks = vi.hoisted(() => ({
  requireRouteCapability: vi.fn(),
  resolveViewerWorkspaceIds: vi.fn(),
  listAccessibleSubagents: vi.fn(),
  createPrivateSubagent: vi.fn(),
}));

vi.mock('../../src/auth/request.js', () => ({
  requireRouteCapability: routeMocks.requireRouteCapability,
}));

vi.mock('../../src/subagents/service.js', () => ({
  listAccessibleSubagents: routeMocks.listAccessibleSubagents,
  createPrivateSubagent: routeMocks.createPrivateSubagent,
}));

vi.mock('../../src/access/service.js', () => ({
  resolveViewerWorkspaceIds: routeMocks.resolveViewerWorkspaceIds,
}));

import { GET, POST } from '../../app/api/subagents/route.js';

describe('subagents route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.requireRouteCapability.mockResolvedValue({ agentId: 'agent-1' });
    routeMocks.resolveViewerWorkspaceIds.mockResolvedValue(['workspace-1']);
    routeMocks.listAccessibleSubagents.mockResolvedValue([]);
    routeMocks.createPrivateSubagent.mockResolvedValue({
      id: 'subagent-1',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      name: 'Research Scout',
      visibility: 'private',
      status: 'active',
    });
  });

  it('threads workspace and project filters through GET', async () => {
    const response = await GET(new NextRequest('http://localhost/api/subagents?workspaceId=workspace-1&projectId=project-1'));
    expect(response.status).toBe(200);
    expect(routeMocks.listAccessibleSubagents).toHaveBeenCalledWith({
      viewerAgentId: 'agent-1',
      workspaceIds: ['workspace-1'],
      workspaceId: 'workspace-1',
      projectId: 'project-1',
    });
  });

  it('creates a project-scoped subagent through POST', async () => {
    const response = await POST(new NextRequest('http://localhost/api/subagents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        name: 'Research Scout',
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(routeMocks.createPrivateSubagent).toHaveBeenCalledWith({
      ownerAgentId: 'agent-1',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      name: 'Research Scout',
      description: null,
      instructions: undefined,
      visibility: 'private',
      exposedCapabilities: undefined,
    });
    expect(body.subagent.projectId).toBe('project-1');
  });
});
