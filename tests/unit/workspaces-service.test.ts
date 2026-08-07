import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSupabase } from '../setup.js';

const stateMocks = vi.hoisted(() => ({
  readLocalRuntimeState: vi.fn(),
  updateLocalRuntimeState: vi.fn(),
}));

vi.mock('../../src/storage/local-state.js', () => ({
  readLocalRuntimeState: stateMocks.readLocalRuntimeState,
  updateLocalRuntimeState: stateMocks.updateLocalRuntimeState,
}));

import { assertWorkspaceMembership } from '../../src/workspaces/service.js';

function emptySingleBuilder() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}

function workspaceBuilder() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        id: 'workspace-1',
        name: 'Workspace',
        slug: 'workspace',
        owner_id: 'agent-1',
        plan: 'retail_free',
        created_at: '2026-08-07T00:00:00.000Z',
      },
      error: null,
    }),
  };
}

describe('workspaces service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stateMocks.readLocalRuntimeState.mockResolvedValue({
      workspaces: [],
      workspaceMembers: [],
    });
  });

  it('allows the workspace owner when the membership join is missing', async () => {
    const memberJoin = emptySingleBuilder();
    const memberLookup = emptySingleBuilder();
    const ownerLookup = workspaceBuilder();

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'workspace_members') {
        return mockSupabase.from.mock.calls.filter(call => call[0] === 'workspace_members').length === 1
          ? memberJoin
          : memberLookup;
      }
      if (table === 'workspaces') return ownerLookup;
      throw new Error(`unexpected table ${table}`);
    });

    const membership = await assertWorkspaceMembership('workspace-1', 'agent-1');

    expect(membership.role).toBe('owner');
    expect(membership.workspace).toMatchObject({
      id: 'workspace-1',
      ownerId: 'agent-1',
    });
    expect(ownerLookup.eq).toHaveBeenCalledWith('owner_id', 'agent-1');
  });
});
