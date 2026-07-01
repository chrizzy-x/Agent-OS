import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSupabase } from '../setup.js';

const mocks = vi.hoisted(() => ({
  listInstalledAgentApps: vi.fn(),
  listLibrary: vi.fn(),
  listUniversalMcpTools: vi.fn(),
  listProjects: vi.fn(),
  listAccessibleSubagents: vi.fn(),
  listVaultSecrets: vi.fn(),
}));

vi.mock('../../src/appstore/service.js', () => ({
  listInstalledAgentApps: mocks.listInstalledAgentApps,
}));

vi.mock('../../src/library/service.js', () => ({
  listLibrary: mocks.listLibrary,
}));

vi.mock('../../src/mcp/registry.js', () => ({
  listUniversalMcpTools: mocks.listUniversalMcpTools,
}));

vi.mock('../../src/projects/service.js', () => ({
  listProjects: mocks.listProjects,
}));

vi.mock('../../src/subagents/service.js', () => ({
  listAccessibleSubagents: mocks.listAccessibleSubagents,
}));

vi.mock('../../src/vault/service.js', () => ({
  listVaultSecrets: mocks.listVaultSecrets,
}));

import { buildCapabilityGraph } from '../../src/capabilities/service.js';

function chain(data: unknown, error: { message: string } | null = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve({ data, error }).then(resolve, reject);
    },
  };
}

describe('capability graph installed skill discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listInstalledAgentApps.mockResolvedValue([]);
    mocks.listLibrary.mockResolvedValue({ items: [] });
    mocks.listUniversalMcpTools.mockResolvedValue([]);
    mocks.listProjects.mockResolvedValue([]);
    mocks.listAccessibleSubagents.mockResolvedValue([]);
    mocks.listVaultSecrets.mockResolvedValue({ secrets: [] });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'skill_installations') {
        return chain([{
          id: 'install-1',
          skill_id: 'skill-1',
          workspace_id: 'workspace-1',
          status: 'active',
          permissions_approved: [],
        }]);
      }
      if (table === 'skills') {
        return chain([{
          id: 'skill-1',
          name: 'Research Skill',
          slug: 'research-skill',
          category: 'Research',
          description: 'Research installed topics.',
          capabilities: [{ name: 'research', description: 'Research a topic.' }],
          permissions_required: [],
          required_secrets: [],
          inputs: { type: 'object' },
          outputs: { type: 'object' },
        }]);
      }
      return chain([]);
    });
  });

  it('adds installed skills as skill capability nodes', async () => {
    const graph = await buildCapabilityGraph({ ownerAgentId: 'agent-1', workspaceId: 'workspace-1' });
    const skill = graph.availableCapabilities.find(item => item.id === 'skill:research-skill');

    expect(graph.summary.bySourceType.skill).toBe(1);
    expect(skill).toMatchObject({
      sourceType: 'skill',
      sourceId: 'skill-1',
      name: 'Research Skill',
      actions: [expect.objectContaining({ id: 'research' })],
    });
  });
});
