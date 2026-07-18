import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSupabase } from '../setup.js';

const libraryMocks = vi.hoisted(() => ({
  listInstalledAgentApps: vi.fn(),
  getAgentAppPackageCacheStatus: vi.fn(),
  resolveSupportedDeviceTargets: vi.fn(),
  listExecutions: vi.fn(),
  listAccessibleFiles: vi.fn(),
  listProjects: vi.fn(),
  listAccessibleSubagents: vi.fn(),
  readLocalRuntimeState: vi.fn(),
}));

vi.mock('../../src/appstore/service.js', () => ({
  listInstalledAgentApps: libraryMocks.listInstalledAgentApps,
  getAgentAppPackageCacheStatus: libraryMocks.getAgentAppPackageCacheStatus,
  resolveSupportedDeviceTargets: libraryMocks.resolveSupportedDeviceTargets,
}));

vi.mock('../../src/files/service.js', () => ({
  listAccessibleFiles: libraryMocks.listAccessibleFiles,
}));

vi.mock('../../src/execution/service.js', () => ({
  listExecutions: libraryMocks.listExecutions,
}));

vi.mock('../../src/projects/service.js', () => ({
  listProjects: libraryMocks.listProjects,
}));

vi.mock('../../src/subagents/service.js', () => ({
  listAccessibleSubagents: libraryMocks.listAccessibleSubagents,
}));

vi.mock('../../src/storage/local-state.js', () => ({
  readLocalRuntimeState: libraryMocks.readLocalRuntimeState,
}));

import { listLibrary } from '../../src/library/service.js';

function chain(data: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    },
  };
}

describe('library service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    libraryMocks.readLocalRuntimeState.mockResolvedValue({ skills: { catalog: [], installations: {} }, libraryItems: [] });
    libraryMocks.getAgentAppPackageCacheStatus.mockResolvedValue({ cached: true, packageRef: 'agentos://workspace/workspace-1/apps/research-kit/1.0.0' });
    libraryMocks.resolveSupportedDeviceTargets.mockReturnValue(['pwa']);
    libraryMocks.listProjects.mockResolvedValue([{
      id: 'project-1',
      workspaceId: 'workspace-1',
      ownerAgentId: 'agent-1',
      name: 'Market Research Project',
      slug: 'market-research',
      description: 'Durable project context',
      status: 'active',
      metadata: {},
      createdAt: '2026-06-01T05:30:00Z',
      updatedAt: '2026-06-01T05:30:00Z',
    }]);
    libraryMocks.listExecutions.mockResolvedValue([{
      id: 'execution-1',
      agentId: 'agent-1',
      userId: 'agent-1',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      sessionId: 'session-1',
      type: 'workflow',
      sourceType: 'workflow',
      sourceId: 'workflow-1',
      workflowId: 'workflow-1',
      appId: null,
      skillId: null,
      mcpServer: null,
      mcpTool: null,
      title: 'Research output',
      status: 'COMPLETED',
      input: {},
      output: { summary: 'Finished report' },
      logs: [],
      error: null,
      failure: null,
      rollback: null,
      actionType: null,
      actionSource: null,
      notificationId: null,
      deepLink: '/tasks?execution=execution-1',
      recoveryAction: null,
      recoveryRequestedAt: null,
      statusDetail: {},
      metadata: {},
      model: null,
      tokenPrompt: 0,
      tokenCompletion: 0,
      tokenTotal: 0,
      estimatedCost: 0,
      durationMs: 120,
      startedAt: null,
      pausedAt: null,
      cancelledAt: null,
      completedAt: '2026-06-01T05:45:00Z',
      createdAt: '2026-06-01T05:40:00Z',
      updatedAt: '2026-06-01T05:45:00Z',
    }]);
    libraryMocks.listInstalledAgentApps.mockResolvedValue([{
      app: {
        id: 'app-1',
        name: 'Research Kit',
        slug: 'research-kit',
        category: 'Research',
        description: 'Research app',
        publisherName: 'AgentOS Labs',
        developerHandle: 'agentos-labs',
        workspaceId: 'workspace-1',
        visibility: 'public',
        platforms: ['AgentOS Cloud'],
        deviceTargets: ['pwa'],
        permissionsRequired: ['files.read'],
        manifest: { version: '1.0.0', permissions: ['files.read'] },
      },
      installation: {
        id: 'install-1',
        workspaceId: 'workspace-1',
        updatedAt: '2026-06-01T10:00:00Z',
        installedAt: '2026-06-01T09:55:00Z',
        lastOpenedAt: '2026-06-01T10:05:00Z',
        status: 'active',
        permissionsApproved: ['files.read'],
      },
    }]);
    libraryMocks.listAccessibleSubagents.mockResolvedValue([{
      id: 'subagent-1',
      name: 'Research Scout',
      description: 'Find sources',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      visibility: 'private',
      updatedAt: '2026-06-01T09:00:00Z',
      exposedCapabilities: ['research'],
      status: 'active',
    }]);
    libraryMocks.listAccessibleFiles.mockResolvedValue([{
      id: 'file-1',
      path: 'notes.md',
      contentType: 'text/markdown',
      workspaceId: 'workspace-1',
      visibility: 'private',
      updatedAt: '2026-06-01T08:00:00Z',
      sizeBytes: 100,
      metadata: { projectId: 'project-1' },
    }]);
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'skill_installations') {
        return chain([{
          id: 'skill-install-1',
          installed_at: '2026-06-01T07:00:00Z',
          skill: {
            id: 'skill-1',
            name: 'Research Notes',
            slug: 'research-notes',
            author_name: 'AgentOS Labs',
            developer_handle: 'agentos-labs',
            version: '1.2.0',
            category: 'Research',
            description: 'Capture notes',
            visibility: 'public',
            published: true,
            permissions_required: ['files.read'],
            compatibility: ['Super AgentOS', 'Workflows'],
          },
        }]);
      }
      if (table === 'agent_workflows') {
        return chain([{
          id: 'workflow-1',
          name: 'Research Flow',
          summary: 'Run research',
          status: 'active',
          visibility: 'private',
          workspace_id: 'workspace-1',
          project_id: 'project-1',
          updated_at: '2026-06-01T06:00:00Z',
        }]);
      }
      if (table === 'skills') return chain([]);
      if (table === 'library_items') {
        return chain([{
          id: 'template-1',
          source_type: 'template',
          name: 'Brief Template',
          description: 'Reusable brief',
          workspace_id: 'workspace-1',
          project_id: null,
          visibility: 'workspace',
          updated_at: '2026-06-01T11:00:00Z',
          metadata: { href: '/library/templates/brief' },
        }]);
      }
      if (table === 'app_package_cache') {
        return chain([{
          id: 'package-1',
          app_id: 'app-1',
          workspace_id: 'workspace-1',
          package_ref: 'agentos://workspace/workspace-1/apps/research-kit/1.0.0',
          package_payload: { name: 'Research Kit package' },
          version: '1.0.0',
          status: 'cached',
          cached_at: '2026-06-01T10:30:00Z',
          updated_at: '2026-06-01T10:30:00Z',
          app: { name: 'Research Kit', slug: 'research-kit', description: 'Research app' },
        }]);
      }
      return chain([]);
    });
  });

  it('aggregates installed assets, saved assets, files, and explicit library items', async () => {
    const library = await listLibrary({ ownerAgentId: 'agent-1', workspaceId: 'workspace-1' });

    expect(library.summary).toMatchObject({
      installed_app: 1,
      installed_skill: 1,
      saved_workflow: 1,
      project: 1,
      subagent: 1,
      saved_output: 1,
      file: 1,
      download: 1,
      template: 1,
    });
    expect(library.items.map(item => item.kind)).toContain('installed_app');
    expect(library.groups.template[0].href).toBe('/library/templates/brief');
    expect(library.groups.installed_app[0].metadata.publisherName).toBe('AgentOS Labs');
    expect(library.groups.installed_app[0].metadata.permissionsRequired).toEqual(['files.read']);
    expect(library.groups.installed_skill[0].metadata.authorName).toBe('AgentOS Labs');
    expect(library.groups.installed_skill[0].metadata.compatibility).toEqual(['Super AgentOS', 'Workflows']);
    expect(library.groups.project[0].href).toBe('/projects/project-1');
    expect(library.groups.saved_output[0].description).toBe('Saved output containing summary.');
    expect(library.groups.download[0].metadata.packageRef).toBe('agentos://workspace/workspace-1/apps/research-kit/1.0.0');
  });

  it('filters by project and search from one library surface', async () => {
    const library = await listLibrary({
      ownerAgentId: 'agent-1',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      search: 'research',
    });

    expect(library.items.every(item => !item.projectId || item.projectId === 'project-1')).toBe(true);
    expect(library.items.map(item => item.kind)).toEqual(expect.arrayContaining(['subagent', 'saved_workflow', 'project', 'saved_output']));
    expect(library.items.find(item => item.kind === 'template')).toBeUndefined();
  });
});
