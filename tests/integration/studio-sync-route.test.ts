import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireRouteCapability: vi.fn(),
  listConfirmations: vi.fn(),
  getStudioSessionIntelligence: vi.fn(),
  listNotifications: vi.fn(),
  getStudioSessionBundle: vi.fn(),
  listStudioSessions: vi.fn(),
  listAgentTasks: vi.fn(),
}));

vi.mock('../../src/auth/request.js', () => ({
  requireRouteCapability: mocks.requireRouteCapability,
}));
vi.mock('../../src/confirmations/service.js', () => ({
  listConfirmations: mocks.listConfirmations,
}));
vi.mock('../../src/intelligence/service.js', () => ({
  getStudioSessionIntelligence: mocks.getStudioSessionIntelligence,
}));
vi.mock('../../src/notifications/service.js', () => ({
  listNotifications: mocks.listNotifications,
}));
vi.mock('../../src/studio/persistence.js', () => ({
  getStudioSessionBundle: mocks.getStudioSessionBundle,
  listStudioSessions: mocks.listStudioSessions,
}));
vi.mock('../../src/tasks/service.js', () => ({
  listAgentTasks: mocks.listAgentTasks,
}));

import { GET } from '../../app/api/studio/sync/route.js';

describe('GET /api/studio/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRouteCapability.mockResolvedValue({ agentId: 'agent-1' });
    mocks.listStudioSessions.mockResolvedValue([
      {
        id: 'session-old',
        workspaceId: 'workspace-1',
        updatedAt: '2026-07-24T10:00:00.000Z',
        deletedAt: null,
      },
      {
        id: 'session-new',
        workspaceId: 'workspace-1',
        updatedAt: '2026-07-24T12:00:00.000Z',
        deletedAt: '2026-07-24T12:00:00.000Z',
      },
    ]);
    mocks.listConfirmations.mockResolvedValue([
      { id: 'approval-1', updatedAt: '2026-07-24T12:01:00.000Z', status: 'pending' },
    ]);
    mocks.listAgentTasks.mockResolvedValue([
      { id: 'task-cancelled', updatedAt: '2026-07-24T12:02:00.000Z', status: 'cancelled', retryCount: 0 },
      { id: 'task-retry', updatedAt: '2026-07-24T12:03:00.000Z', status: 'retrying', retryCount: 1 },
    ]);
    mocks.listNotifications.mockResolvedValue([
      { id: 'notification-1', createdAt: '2026-07-24T12:04:00.000Z', status: 'unread' },
    ]);
    mocks.getStudioSessionBundle.mockResolvedValue({
      session: { id: 'session-new' },
      messages: [],
      events: [],
      lineage: { parent: null, children: [] },
    });
    mocks.getStudioSessionIntelligence.mockResolvedValue({
      selection: {
        mode: 'native',
        connectionId: null,
        modelId: null,
        consensusConfigurationId: null,
        selectionSource: 'session',
      },
    });
  });

  it('returns a versioned cross-device sync envelope', async () => {
    const response = await GET(new NextRequest('http://localhost/api/studio/sync?workspaceId=workspace-1&sessionId=session-new&since=2026-07-24T11:00:00.000Z'));
    const body = await response.json() as Record<string, unknown>;

    expect(body.syncContract).toEqual(expect.objectContaining({
      version: 'super-agentos-studio-sync-v1',
      owner: 'super_agentos',
    }));
    expect(body.sessions).toEqual([
      expect.objectContaining({ id: 'session-new', deletedAt: '2026-07-24T12:00:00.000Z' }),
    ]);
    expect(body.intelligenceSelection).toEqual(expect.objectContaining({ mode: 'native' }));
    expect(body.approvals).toHaveLength(1);
    expect(body.cancellationStates).toEqual([expect.objectContaining({ id: 'task-cancelled' })]);
    expect(body.retryStates).toEqual([expect.objectContaining({ id: 'task-retry' })]);
    expect(body.notifications).toEqual([expect.objectContaining({ id: 'notification-1' })]);
    expect(mocks.listStudioSessions).toHaveBeenCalledWith('agent-1', { status: 'all', includeDeleted: true });
  });
});
