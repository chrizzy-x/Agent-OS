import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const routeMocks = vi.hoisted(() => ({
  requireRouteCapability: vi.fn(),
  createStudioSessionBranch: vi.fn(),
}));

vi.mock('../../src/auth/request.js', () => ({
  requireRouteCapability: routeMocks.requireRouteCapability,
}));

vi.mock('../../src/studio/persistence.js', () => ({
  createStudioSessionBranch: routeMocks.createStudioSessionBranch,
}));

import { POST } from '../../app/api/studio/sessions/[id]/branch/route.js';

describe('POST /api/studio/sessions/:id/branch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.requireRouteCapability.mockResolvedValue({ agentId: 'agent-1' });
    routeMocks.createStudioSessionBranch.mockResolvedValue({
      id: 'branch-1',
      title: 'Research Session Branch',
    });
  });

  it('creates a branched studio session with lineage metadata', async () => {
    const response = await POST(new NextRequest('http://localhost/api/studio/sessions/session-1/branch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        snapshotId: 'snapshot-1',
        title: 'Research Session Branch',
        branchLabel: 'Research Session',
      }),
    }), {
      params: Promise.resolve({ id: 'session-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(routeMocks.createStudioSessionBranch).toHaveBeenCalledWith({
      ownerAgentId: 'agent-1',
      sessionId: 'session-1',
      snapshotId: 'snapshot-1',
      title: 'Research Session Branch',
      branchLabel: 'Research Session',
      projectId: null,
    });
    expect(body.session.id).toBe('branch-1');
  });
});
