import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { mockSupabase } from '../setup.js';

const routeMocks = vi.hoisted(() => ({
  requireAgentContextWithTier: vi.fn(),
  requireRouteCapability: vi.fn(),
  hasAdminAccess: vi.fn(),
  executeAgentOSAction: vi.fn(),
  listLibrary: vi.fn(),
  getPanicStatus: vi.fn(),
  executePanicAction: vi.fn(),
  createNotification: vi.fn(),
  getProject: vi.fn(),
  summarizeProjectActivity: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  listInstalledAgentApps: vi.fn(),
  listAccessibleFiles: vi.fn(),
  listAccessibleMemoryEntries: vi.fn(),
  listAccessibleSubagents: vi.fn(),
  listVaultSecrets: vi.fn(),
}));

vi.mock('../../src/auth/request.js', () => ({
  requireAgentContextWithTier: routeMocks.requireAgentContextWithTier,
  requireRouteCapability: routeMocks.requireRouteCapability,
  hasAdminAccess: routeMocks.hasAdminAccess,
}));

vi.mock('../../src/actions/service.js', () => ({
  executeAgentOSAction: routeMocks.executeAgentOSAction,
}));

vi.mock('../../src/library/service.js', () => ({
  listLibrary: routeMocks.listLibrary,
}));

vi.mock('../../src/panic/service.js', () => ({
  getPanicStatus: routeMocks.getPanicStatus,
  executePanicAction: routeMocks.executePanicAction,
}));

vi.mock('../../src/notifications/service.js', () => ({
  createNotification: routeMocks.createNotification,
}));

vi.mock('../../src/projects/service.js', () => ({
  getProject: routeMocks.getProject,
  summarizeProjectActivity: routeMocks.summarizeProjectActivity,
  updateProject: routeMocks.updateProject,
  deleteProject: routeMocks.deleteProject,
}));

vi.mock('../../src/appstore/service.js', () => ({
  listInstalledAgentApps: routeMocks.listInstalledAgentApps,
}));

vi.mock('../../src/files/service.js', () => ({
  listAccessibleFiles: routeMocks.listAccessibleFiles,
}));

vi.mock('../../src/memory/service.js', () => ({
  listAccessibleMemoryEntries: routeMocks.listAccessibleMemoryEntries,
}));

vi.mock('../../src/subagents/service.js', () => ({
  listAccessibleSubagents: routeMocks.listAccessibleSubagents,
}));

vi.mock('../../src/vault/service.js', () => ({
  listVaultSecrets: routeMocks.listVaultSecrets,
}));

import { POST as postAction } from '../../app/api/actions/route.js';
import { GET as getLibrary } from '../../app/api/library/route.js';
import { GET as getProjectDetail } from '../../app/api/projects/[id]/route.js';
import { GET as getPanic, POST as postPanic } from '../../app/api/panic/route.js';

function request(url: string, method = 'GET', body?: Record<string, unknown>) {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function chain(data: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    },
  };
}

describe('v6.5.2 product alignment routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.requireAgentContextWithTier.mockResolvedValue({ agentId: 'agent-1', tier: 'retail_free' });
    routeMocks.requireRouteCapability.mockResolvedValue({ agentId: 'agent-1', tier: 'retail_free' });
    routeMocks.hasAdminAccess.mockReturnValue(false);
    routeMocks.createNotification.mockResolvedValue({});
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'nl_studio_sessions') return chain([{ id: 'chat-1', title: 'Chat', status: 'active' }]);
      if (table === 'agent_workflows') return chain([{ id: 'workflow-1', name: 'Flow', status: 'active' }]);
      if (table === 'skill_installations') return chain([{ id: 'skill-install-1', skill: { id: 'skill-1', name: 'Skill' } }]);
      if (table === 'mcp_servers') return chain([{ id: 'mcp-1', name: 'github', active: true }]);
      return chain([]);
    });
  });

  it('POST /api/actions validates and dispatches unified actions', async () => {
    const invalid = await postAction(request('http://localhost/api/actions', 'POST', { action: 'unknown' }));
    expect(invalid.status).toBe(400);

    routeMocks.executeAgentOSAction.mockResolvedValue({
      action: 'create_project',
      source: 'manual_ui',
      status: 'completed',
      result: { project: { id: 'project-1' } },
      execution: { id: 'exec-1' },
    });
    const response = await postAction(request('http://localhost/api/actions', 'POST', {
      action: 'create_project',
      source: 'manual_ui',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      sessionId: 'session-1',
      payload: { name: 'Research' },
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(routeMocks.executeAgentOSAction).toHaveBeenCalledWith(
      { agentId: 'agent-1', tier: 'retail_free' },
      expect.objectContaining({
        action: 'create_project',
        source: 'manual_ui',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        sessionId: 'session-1',
        payload: { name: 'Research' },
      }),
    );
    expect(body.execution.id).toBe('exec-1');
  });

  it('GET /api/library returns the unified library payload', async () => {
    routeMocks.listLibrary.mockResolvedValue({
      items: [{ id: 'install-1', kind: 'installed_app', name: 'Research Kit' }],
      groups: { installed_app: [{ id: 'install-1' }] },
      summary: { installed_app: 1 },
    });

    const response = await getLibrary(request('http://localhost/api/library?workspaceId=workspace-1&q=research&limit=10'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(routeMocks.listLibrary).toHaveBeenCalledWith({
      ownerAgentId: 'agent-1',
      workspaceId: 'workspace-1',
      projectId: null,
      search: 'research',
      limit: 10,
    });
    expect(body.summary.installed_app).toBe(1);
  });

  it('GET /api/projects/[id] aggregates project-owned tabs', async () => {
    routeMocks.getProject.mockResolvedValue({ id: 'project-1', workspaceId: 'workspace-1', name: 'Research' });
    routeMocks.summarizeProjectActivity.mockResolvedValue({ total: 2 });
    routeMocks.listInstalledAgentApps.mockResolvedValue([{ app: { id: 'app-1' }, installation: { workspaceId: 'workspace-1' } }]);
    routeMocks.listAccessibleFiles.mockResolvedValue([{ id: 'file-1' }]);
    routeMocks.listAccessibleMemoryEntries.mockResolvedValue([{ id: 'mem-1' }]);
    routeMocks.listAccessibleSubagents.mockResolvedValue([{ id: 'subagent-1' }]);
    routeMocks.listVaultSecrets.mockResolvedValue({ secrets: [{ id: 'secret-1', name: 'OPENAI_API_KEY' }] });

    const response = await getProjectDetail(request('http://localhost/api/projects/project-1'), {
      params: Promise.resolve({ id: 'project-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.tabs.chats).toHaveLength(1);
    expect(body.tabs.files).toHaveLength(1);
    expect(body.tabs.apps).toHaveLength(1);
    expect(body.tabs.skills).toHaveLength(1);
    expect(body.tabs.workflows).toHaveLength(1);
    expect(body.tabs.subagents).toHaveLength(1);
    expect(body.tabs.memory).toHaveLength(1);
    expect(body.tabs.secrets).toHaveLength(1);
    expect(body.tabs.mcp).toHaveLength(1);
  });

  it('GET and POST /api/panic expose status and actions', async () => {
    routeMocks.getPanicStatus.mockResolvedValue({ state: 'warning', activeCount: 1, executions: [{ id: 'exec-1' }] });
    routeMocks.executePanicAction.mockResolvedValue({
      state: 'emergency',
      activeCount: 0,
      affected: 1,
      vaultRuntimeGrantsRevoked: 1,
      executions: [],
    });

    const status = await getPanic(request('http://localhost/api/panic?workspaceId=workspace-1&sessionId=session-1'));
    const statusBody = await status.json();
    const action = await postPanic(request('http://localhost/api/panic', 'POST', {
      action: 'lockdown',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    }));
    const actionBody = await action.json();

    expect(status.status).toBe(200);
    expect(statusBody.state).toBe('warning');
    expect(routeMocks.getPanicStatus).toHaveBeenCalledWith({ agentId: 'agent-1', workspaceId: 'workspace-1', sessionId: 'session-1' });
    expect(action.status).toBe(200);
    expect(actionBody.state).toBe('emergency');
    expect(routeMocks.executePanicAction).toHaveBeenCalledWith({ agentId: 'agent-1', workspaceId: 'workspace-1', sessionId: 'session-1', action: 'lockdown' });
    expect(routeMocks.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'panic',
      title: 'Panic lockdown enabled',
    }));
  });
});
