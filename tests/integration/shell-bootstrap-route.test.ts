import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAgentContextWithTier: vi.fn(),
  listWorkspaces: vi.fn(),
  listStudioSessions: vi.fn(),
  listProjects: vi.fn(),
  listNotifications: vi.fn(),
  listExternalAgents: vi.fn(),
}));

vi.mock('../../src/auth/request.js', () => ({
  requireAgentContextWithTier: mocks.requireAgentContextWithTier,
}));
vi.mock('../../src/workspaces/service.js', () => ({ listWorkspaces: mocks.listWorkspaces }));
vi.mock('../../src/studio/persistence.js', () => ({ listStudioSessions: mocks.listStudioSessions }));
vi.mock('../../src/projects/service.js', () => ({ listProjects: mocks.listProjects }));
vi.mock('../../src/notifications/service.js', () => ({ listNotifications: mocks.listNotifications }));
vi.mock('../../src/external-agents/service.js', () => ({ listExternalAgents: mocks.listExternalAgents }));

import { GET } from '../../app/api/shell/bootstrap/route.js';

describe('GET /api/shell/bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAgentContextWithTier.mockResolvedValue({ agentId: 'agent-1', tier: 'retail_pro' });
    mocks.listWorkspaces.mockResolvedValue([{ id: 'workspace-1', name: 'Workspace', slug: 'workspace', plan: 'retail_pro' }]);
    mocks.listStudioSessions.mockResolvedValue([{
      id: 'session-1',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      title: 'Pinned session',
      status: 'active',
      pinnedAt: '2026-06-19T10:00:00Z',
      archivedAt: null,
      updatedAt: '2026-06-19T10:00:00Z',
    }]);
    mocks.listProjects.mockResolvedValue([{
      id: 'project-1',
      workspaceId: 'workspace-1',
      name: 'Recovery',
      status: 'active',
      metadata: { pinned: true, template: 'research' },
      updatedAt: '2026-06-19T10:00:00Z',
    }]);
    mocks.listNotifications.mockResolvedValue([{ status: 'unread' }, { status: 'read' }]);
    mocks.listExternalAgents.mockResolvedValue([{ status: 'active' }, { status: 'idle' }]);
  });

  it('returns workspace, session, project, notification, and agent shell state', async () => {
    const response = await GET(new NextRequest('http://localhost/api/shell/bootstrap'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.workspaces[0].id).toBe('workspace-1');
    expect(body.sessions[0]).toMatchObject({ id: 'session-1', pinnedAt: '2026-06-19T10:00:00Z' });
    expect(body.projects[0]).toMatchObject({ id: 'project-1', pinned: true });
    expect(body.notifications.unread).toBe(1);
    expect(body.agents.connected).toBe(1);
    expect(mocks.listStudioSessions).toHaveBeenCalledWith('agent-1', { status: 'all' });
  });
});
