import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../../app/api/studio/bootstrap/route.js';

const { requireRouteCapability, buildStudioBootstrap } = vi.hoisted(() => ({
  requireRouteCapability: vi.fn(),
  buildStudioBootstrap: vi.fn(),
}));

vi.mock('../../src/auth/request.js', () => ({
  requireRouteCapability,
}));

vi.mock('../../src/studio/bootstrap.js', () => ({
  buildStudioBootstrap,
}));

describe('GET /api/studio/bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRouteCapability.mockResolvedValue({ agentId: 'agent-1' });
    buildStudioBootstrap.mockResolvedValue({ ok: true });
  });

  it('loads a shared Studio bootstrap payload for both modes', async () => {
    const response = await GET(new NextRequest('http://localhost/api/studio/bootstrap?session=s1&project=p1&mode=code'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(buildStudioBootstrap).toHaveBeenCalledWith({
      ownerAgentId: 'agent-1',
      sessionId: 's1',
      projectId: 'p1',
      workspaceId: null,
      mode: 'code',
    });
    expect(body).toEqual({ ok: true });
  });

  it('preserves Workflow Studio mode', async () => {
    await GET(new NextRequest('http://localhost/api/studio/bootstrap?mode=workflow'));

    expect(buildStudioBootstrap).toHaveBeenCalledWith({
      ownerAgentId: 'agent-1',
      sessionId: null,
      projectId: null,
      workspaceId: null,
      mode: 'workflow',
    });
  });
});
