import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const routeMocks = vi.hoisted(() => ({
  requireRouteCapability: vi.fn(),
  getStudioSessionBundle: vi.fn(),
  getStudioSessionIntelligence: vi.fn(),
  setStudioSessionIntelligence: vi.fn(),
  resolveProjectForWorkspace: vi.fn(),
  updateStudioSession: vi.fn(),
}));

vi.mock('../../src/auth/request.js', () => ({
  requireRouteCapability: routeMocks.requireRouteCapability,
}));

vi.mock('../../src/studio/persistence.js', () => ({
  getStudioSessionBundle: routeMocks.getStudioSessionBundle,
  updateStudioSession: routeMocks.updateStudioSession,
}));

vi.mock('../../src/intelligence/service.js', () => ({
  getStudioSessionIntelligence: routeMocks.getStudioSessionIntelligence,
  setStudioSessionIntelligence: routeMocks.setStudioSessionIntelligence,
}));

vi.mock('../../src/projects/service.js', () => ({
  resolveProjectForWorkspace: routeMocks.resolveProjectForWorkspace,
}));

import { DELETE, GET, PATCH } from '../../app/api/studio/sessions/[id]/route.js';

describe('studio session route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.requireRouteCapability.mockResolvedValue({ agentId: 'agent-1' });
    routeMocks.getStudioSessionBundle.mockResolvedValue({
      session: {
        id: 'session-1',
        workspaceId: 'workspace-1',
        projectId: null,
        title: 'Session',
      },
      messages: [],
      events: [],
      lineage: { parent: null, children: [] },
    });
    routeMocks.resolveProjectForWorkspace.mockResolvedValue({ id: 'project-2', workspaceId: 'workspace-1' });
    routeMocks.updateStudioSession.mockResolvedValue({
      id: 'session-1',
      title: 'Renamed session',
      status: 'active',
      state: { instructions: 'Use project context' },
    });
    routeMocks.getStudioSessionIntelligence.mockResolvedValue({
      selection: {
        mode: 'native',
        connectionId: null,
        modelId: null,
        consensusConfigurationId: null,
        selectionSource: 'session',
      },
    });
    routeMocks.setStudioSessionIntelligence.mockResolvedValue({
      selection: {
        mode: 'single',
        connectionId: 'connection-1',
        modelId: 'gpt-5',
        consensusConfigurationId: null,
        selectionSource: 'session',
      },
    });
  });

  it('returns the persisted intelligence selection with the session bundle', async () => {
    const response = await GET(new NextRequest('http://localhost/api/studio/sessions/session-1'), {
      params: Promise.resolve({ id: 'session-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.intelligenceSelection).toMatchObject({ mode: 'native' });
    expect(routeMocks.getStudioSessionIntelligence).toHaveBeenCalledWith({
      ownerAgentId: 'agent-1',
      sessionId: 'session-1',
    });
  });

  it('attaches the session to a validated project through PATCH', async () => {
    const response = await PATCH(new NextRequest('http://localhost/api/studio/sessions/session-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'project-2' }),
    }), {
      params: Promise.resolve({ id: 'session-1' }),
    });

    expect(response.status).toBe(200);
    expect(routeMocks.resolveProjectForWorkspace).toHaveBeenCalledWith({
      ownerAgentId: 'agent-1',
      workspaceId: 'workspace-1',
      projectId: 'project-2',
    });
    expect(routeMocks.updateStudioSession).toHaveBeenCalledWith(expect.objectContaining({
      ownerAgentId: 'agent-1',
      sessionId: 'session-1',
      projectId: 'project-2',
    }));
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

  it('persists session intelligence selection without legacy execution target state', async () => {
    const response = await PATCH(new NextRequest('http://localhost/api/studio/sessions/session-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intelligenceSelection: {
          mode: 'single',
          connectionId: 'connection-1',
          modelId: 'gpt-5',
          consensusConfigurationId: null,
          selectionSource: 'session',
        },
      }),
    }), {
      params: Promise.resolve({ id: 'session-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(routeMocks.updateStudioSession).toHaveBeenCalledWith(expect.objectContaining({
      statePatch: undefined,
    }));
    expect(routeMocks.setStudioSessionIntelligence).toHaveBeenCalledWith({
      ownerAgentId: 'agent-1',
      sessionId: 'session-1',
      selection: {
        mode: 'single',
        connectionId: 'connection-1',
        modelId: 'gpt-5',
        consensusConfigurationId: null,
        selectionSource: 'session',
      },
    });
    expect(JSON.stringify(routeMocks.updateStudioSession.mock.calls.at(-1)?.[0] ?? {})).not.toContain('executionTargetId');
    expect(body.intelligenceSelection).toMatchObject({ modelId: 'gpt-5' });
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
