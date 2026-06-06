import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const routeMocks = vi.hoisted(() => ({
  requireRouteCapability: vi.fn(),
  updateStudioSession: vi.fn(),
}));

vi.mock('../../src/auth/request.js', () => ({
  requireRouteCapability: routeMocks.requireRouteCapability,
}));

vi.mock('../../src/studio/persistence.js', () => ({
  getStudioSessionBundle: vi.fn(),
  updateStudioSession: routeMocks.updateStudioSession,
}));

import { DELETE, PATCH } from '../../app/api/studio/sessions/[id]/route.js';

describe('studio session route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.requireRouteCapability.mockResolvedValue({ agentId: 'agent-1' });
    routeMocks.updateStudioSession.mockResolvedValue({
      id: 'session-1',
      title: 'Renamed session',
      status: 'active',
      state: { instructions: 'Use project context' },
    });
  });

  it('updates title and session instructions through PATCH', async () => {
    const response = await PATCH(new NextRequest('http://localhost/api/studio/sessions/session-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Renamed session',
        statePatch: { instructions: 'Use project context', mode: 'NORMAL_CHAT' },
      }),
    }), {
      params: Promise.resolve({ id: 'session-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(routeMocks.updateStudioSession).toHaveBeenCalledWith({
      ownerAgentId: 'agent-1',
      sessionId: 'session-1',
      title: 'Renamed session',
      status: undefined,
      statePatch: { instructions: 'Use project context', mode: 'NORMAL_CHAT' },
    });
    expect(body.session.title).toBe('Renamed session');
  });

  it('archives the session through DELETE', async () => {
    const response = await DELETE(new NextRequest('http://localhost/api/studio/sessions/session-1', {
      method: 'DELETE',
    }), {
      params: Promise.resolve({ id: 'session-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(routeMocks.updateStudioSession).toHaveBeenCalledWith({
      ownerAgentId: 'agent-1',
      sessionId: 'session-1',
      status: 'archived',
    });
    expect(body.archived).toBe(true);
  });
});
