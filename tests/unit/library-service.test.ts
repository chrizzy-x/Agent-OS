import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSupabase } from '../setup.js';

const libraryMocks = vi.hoisted(() => ({
  listInstalledAgentApps: vi.fn(),
  getAgentAppPackageCacheStatus: vi.fn(),
  resolveSupportedDeviceTargets: vi.fn(),
  listAccessibleFiles: vi.fn(),
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
    libraryMocks.listInstalledAgentApps.mockResolvedValue([{
      app: {
        id: 'app-1',
        name: 'Research Kit',
        slug: 'research-kit',
        description: 'Research app',
        workspaceId: 'workspace-1',
        visibility: 'public',
      },
      installation: {
        id: 'install-1',
        workspaceId: 'workspace-1',
        updatedAt: '2026-06-01T10:00:00Z',
        status: 'active',
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
            category: 'Research',
            description: 'Capture notes',
            visibility: 'public',
            published: true,
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
      return chain([]);
    });
  });

  it('aggregates installed assets, saved assets, files, and explicit library items', async () => {
    const library = await listLibrary({ ownerAgentId: 'agent-1', workspaceId: 'workspace-1' });

    expect(library.summary).toMatchObject({
      installed_app: 1,
      installed_skill: 1,
      saved_workflow: 1,
      subagent: 1,
      file: 1,
      template: 1,
    });
    expect(library.items.map(item => item.kind)).toContain('installed_app');
    expect(library.groups.template[0].href).toBe('/library/templates/brief');
  });

  it('filters by project and search from one library surface', async () => {
    const library = await listLibrary({
      ownerAgentId: 'agent-1',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      search: 'research',
    });

    expect(library.items.every(item => !item.projectId || item.projectId === 'project-1')).toBe(true);
    expect(library.items.map(item => item.kind)).toEqual(expect.arrayContaining(['subagent', 'saved_workflow']));
    expect(library.items.find(item => item.kind === 'template')).toBeUndefined();
  });
});
