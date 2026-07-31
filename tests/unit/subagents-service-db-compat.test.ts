import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSupabase } from '../setup.js';

const serviceMocks = vi.hoisted(() => ({
  assertWorkspaceMembership: vi.fn(),
  resolveProjectForWorkspace: vi.fn(),
}));

vi.mock('../../src/workspaces/service.js', () => ({
  assertWorkspaceMembership: serviceMocks.assertWorkspaceMembership,
}));

vi.mock('../../src/projects/service.js', () => ({
  resolveProjectForWorkspace: serviceMocks.resolveProjectForWorkspace,
}));

import { createPrivateSubagent } from '../../src/subagents/service.js';

describe('subagent service DB compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.assertWorkspaceMembership.mockResolvedValue({ workspace: { id: 'workspace-1' } });
    serviceMocks.resolveProjectForWorkspace.mockResolvedValue({ id: 'project-1' });
  });

  it('falls back when production schema cache lacks exposed_capabilities', async () => {
    const inserted: Array<Record<string, unknown>> = [];

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'private_subagents') {
        return {
          insert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
            inserted.push(payload);
            return {
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue(inserted.length === 1
                ? { data: null, error: { code: 'PGRST204', message: "Could not find the 'exposed_capabilities' column of 'private_subagents' in the schema cache" } }
                : { data: { ...payload, exposed_capabilities: [] }, error: null }),
            };
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    const subagent = await createPrivateSubagent({
      ownerAgentId: 'agent-1',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      name: 'Proof Prime Agent',
      exposedCapabilities: ['studio.command'],
    });

    expect(subagent.name).toBe('Proof Prime Agent');
    expect(subagent.exposedCapabilities).toEqual([]);
    expect(inserted).toHaveLength(2);
    expect(inserted[0].exposed_capabilities).toEqual(['studio.command']);
    expect(inserted[1]).not.toHaveProperty('exposed_capabilities');
  });
});
