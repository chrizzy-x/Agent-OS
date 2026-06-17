import { beforeEach, describe, expect, it, vi } from 'vitest';

const actionMocks = vi.hoisted(() => ({
  getAgentAppReadiness: vi.fn(),
  installAgentApp: vi.fn(),
  recordAgentAppOpen: vi.fn(),
  updateAgentAppInstallation: vi.fn(),
  runTrackedExecution: vi.fn(),
  updateExecution: vi.fn(),
  executePanicAction: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  createPrivateSubagent: vi.fn(),
  createNotification: vi.fn(),
  logOperation: vi.fn(),
}));

vi.mock('../../src/appstore/service.js', () => ({
  getAgentAppReadiness: actionMocks.getAgentAppReadiness,
  installAgentApp: actionMocks.installAgentApp,
  recordAgentAppOpen: actionMocks.recordAgentAppOpen,
  updateAgentAppInstallation: actionMocks.updateAgentAppInstallation,
}));

vi.mock('../../src/execution/service.js', () => ({
  runTrackedExecution: actionMocks.runTrackedExecution,
  updateExecution: actionMocks.updateExecution,
}));

vi.mock('../../src/panic/service.js', () => ({
  executePanicAction: actionMocks.executePanicAction,
}));

vi.mock('../../src/projects/service.js', () => ({
  createProject: actionMocks.createProject,
  updateProject: actionMocks.updateProject,
}));

vi.mock('../../src/subagents/service.js', () => ({
  createPrivateSubagent: actionMocks.createPrivateSubagent,
}));

vi.mock('../../src/notifications/service.js', () => ({
  createNotification: actionMocks.createNotification,
}));

vi.mock('../../src/runtime/audit.js', () => ({
  logOperation: actionMocks.logOperation,
}));

import { executeAgentOSAction } from '../../src/actions/service.js';

describe('executeAgentOSAction', () => {
  const ctx = { agentId: 'agent-1', tier: 'retail_free' };

  beforeEach(() => {
    vi.clearAllMocks();
    actionMocks.runTrackedExecution.mockImplementation(async (params: { run: (execution: { id: string }) => Promise<unknown> | unknown; title: string; sourceType: string }) => ({
      execution: { id: 'exec-1', title: params.title, sourceType: params.sourceType, status: 'completed' },
      result: await params.run({ id: 'exec-1' }),
    }));
    actionMocks.createNotification.mockResolvedValue({ id: 'notification-1' });
    actionMocks.logOperation.mockResolvedValue('audit-1');
    actionMocks.updateExecution.mockResolvedValue({ id: 'exec-1' });
  });

  it('dispatches app installs through tracked execution', async () => {
    actionMocks.getAgentAppReadiness.mockResolvedValue({ app: { id: 'app-1' } });
    actionMocks.installAgentApp.mockResolvedValue({ app: { slug: 'research-kit' }, installation: { id: 'install-1' } });

    const result = await executeAgentOSAction(ctx, {
      action: 'install_app',
      source: 'manual_ui',
      workspaceId: 'workspace-1',
      payload: { slug: 'research-kit', permissionsApproved: ['network'] },
    });

    expect(actionMocks.getAgentAppReadiness).toHaveBeenCalledWith({
      agentId: 'agent-1',
      slug: 'research-kit',
      workspaceId: 'workspace-1',
      canManageAll: undefined,
      permissionsApproved: ['network'],
    });
    expect(actionMocks.installAgentApp).toHaveBeenCalledWith({
      agentId: 'agent-1',
      slug: 'research-kit',
      workspaceId: 'workspace-1',
      canManageAll: undefined,
      permissionsApproved: ['network'],
    });
    expect(actionMocks.runTrackedExecution).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'agent-1',
      workspaceId: 'workspace-1',
      sourceType: 'app',
      appId: 'app-1',
      title: 'Install app research-kit',
    }));
    expect(result.action).toBe('install_app');
    expect(result.execution).toEqual(expect.objectContaining({ id: 'exec-1' }));
    expect(result.executionId).toBe('exec-1');
    expect(result.notificationId).toBe('notification-1');
    expect(result.auditId).toBe('audit-1');
    expect(result.deepLink).toBe('/appstore/research-kit');
    expect(actionMocks.logOperation).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'agent-1',
      workspaceId: 'workspace-1',
      executionId: 'exec-1',
      primitive: 'action',
      operation: 'install_app',
      success: true,
    }));
    expect(actionMocks.updateExecution).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'agent-1',
      executionId: 'exec-1',
      patch: expect.objectContaining({
        actionType: 'install_app',
        actionSource: 'manual_ui',
        notificationId: 'notification-1',
        deepLink: '/appstore/research-kit',
      }),
    }));
  });

  it('routes project and subagent creation through the same execution layer', async () => {
    actionMocks.createProject.mockResolvedValue({ id: 'project-1', name: 'Research' });
    actionMocks.createPrivateSubagent.mockResolvedValue({ id: 'subagent-1', name: 'Research Scout' });

    await executeAgentOSAction(ctx, {
      action: 'create_project',
      source: 'natural_language',
      workspaceId: 'workspace-1',
      payload: { workspaceId: 'workspace-1', name: 'Research' },
    });
    await executeAgentOSAction(ctx, {
      action: 'create_subagent',
      source: 'manual_ui',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      payload: { workspaceId: 'workspace-1', name: 'Research Scout' },
    });

    expect(actionMocks.createProject).toHaveBeenCalledWith(expect.objectContaining({
      ownerAgentId: 'agent-1',
      workspaceId: 'workspace-1',
      name: 'Research',
    }));
    expect(actionMocks.createPrivateSubagent).toHaveBeenCalledWith(expect.objectContaining({
      ownerAgentId: 'agent-1',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      name: 'Research Scout',
      exposedCapabilities: undefined,
    }));
    expect(actionMocks.runTrackedExecution).toHaveBeenCalledTimes(2);
  });

  it('validates required payload before dispatch', async () => {
    await expect(executeAgentOSAction(ctx, {
      action: 'install_app',
      payload: {},
    })).rejects.toThrow('slug is required');
    expect(actionMocks.runTrackedExecution).not.toHaveBeenCalled();
  });
});
