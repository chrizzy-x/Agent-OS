import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSupabase } from '../setup.js';

vi.mock('../../src/workspaces/service.js', () => ({
  assertWorkspaceMembership: vi.fn().mockResolvedValue(undefined),
}));

import { createStudioSessionBranch, getStudioSessionBundle } from '../../src/studio/persistence.js';

type TableRow = Record<string, unknown>;

function createStudioSupabase() {
  const tables: Record<string, TableRow[]> = {
    nl_studio_sessions: [],
    nl_studio_snapshots: [],
    nl_studio_messages: [],
    nl_studio_events: [],
  };

  function applyFilters(rows: TableRow[], filters: Array<{ field: string; value: unknown }>) {
    return rows.filter(row => filters.every(filter => row[filter.field] === filter.value));
  }

  function sortRows(rows: TableRow[], orderField: string | null, ascending: boolean) {
    if (!orderField) return rows;
    return [...rows].sort((left, right) => {
      const a = String(left[orderField] ?? '');
      const b = String(right[orderField] ?? '');
      return ascending ? a.localeCompare(b) : b.localeCompare(a);
    });
  }

  function builder(table: string) {
    const filters: Array<{ field: string; value: unknown }> = [];
    let orderField: string | null = null;
    let ascending = true;
    let limitValue: number | null = null;

    const query = {
      select: vi.fn().mockReturnThis(),
      eq(field: string, value: unknown) {
        filters.push({ field, value });
        return query;
      },
      order(field: string, options?: { ascending?: boolean }) {
        orderField = field;
        ascending = options?.ascending !== false;
        return query;
      },
      limit(value: number) {
        limitValue = value;
        return query;
      },
      maybeSingle() {
        const rows = sortRows(applyFilters(tables[table] ?? [], filters), orderField, ascending);
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      single() {
        const rows = sortRows(applyFilters(tables[table] ?? [], filters), orderField, ascending);
        return Promise.resolve({ data: rows[0] ?? null, error: rows[0] ? null : { message: 'not found' } });
      },
      insert(payload: TableRow) {
        const next = { ...payload };
        tables[table] ??= [];
        tables[table].push(next);
        return {
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: next, error: null }),
        };
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        let rows = sortRows(applyFilters(tables[table] ?? [], filters), orderField, ascending);
        if (typeof limitValue === 'number') rows = rows.slice(0, limitValue);
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      },
    };

    return query;
  }

  return {
    tables,
    client: {
      from: vi.fn((table: string) => builder(table)),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      storage: { from: vi.fn() },
    },
  };
}

describe.sequential('studio session branching persistence', () => {
  let db: ReturnType<typeof createStudioSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createStudioSupabase();
    mockSupabase.from.mockImplementation(db.client.from);
    mockSupabase.rpc.mockImplementation(db.client.rpc);

    db.tables.nl_studio_sessions.push({
      id: 'session-1',
      workspace_id: 'workspace-1',
      owner_agent_id: 'agent-1',
      super_agent_id: null,
      parent_session_id: null,
      parent_snapshot_id: null,
      branch_label: null,
      title: 'Root Session',
      status: 'active',
      state: { workflowGraph: { nodes: [{ id: 'root' }], edges: [] }, note: 'root-state' },
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-01T00:00:00Z',
    });
    db.tables.nl_studio_snapshots.push(
      {
        id: 'snapshot-1',
        session_id: 'session-1',
        workspace_id: 'workspace-1',
        owner_agent_id: 'agent-1',
        label: 'Earlier',
        state: { workflowGraph: { nodes: [{ id: 'snap-1' }], edges: [] }, note: 'snapshot-one' },
        created_at: '2026-06-01T00:05:00Z',
      },
      {
        id: 'snapshot-2',
        session_id: 'session-1',
        workspace_id: 'workspace-1',
        owner_agent_id: 'agent-1',
        label: 'Latest',
        state: { workflowGraph: { nodes: [{ id: 'snap-2' }], edges: [] }, note: 'snapshot-two' },
        created_at: '2026-06-01T00:10:00Z',
      },
    );
    db.tables.nl_studio_messages.push({
      id: 'message-1',
      session_id: 'session-1',
      role: 'user',
      content: 'keep parent messages isolated',
      created_at: '2026-06-01T00:01:00Z',
    });
    db.tables.nl_studio_events.push({
      id: 'event-1',
      session_id: 'session-1',
      type: 'task_started',
      payload: { scope: 'parent-only' },
      created_at: '2026-06-01T00:02:00Z',
    });
  });

  it('branches from a chosen snapshot and keeps messages and events isolated', async () => {
    const branch = await createStudioSessionBranch({
      ownerAgentId: 'agent-1',
      sessionId: 'session-1',
      snapshotId: 'snapshot-1',
      title: 'Chosen Snapshot Branch',
      branchLabel: 'Chosen Snapshot',
    });

    const bundle = await getStudioSessionBundle('agent-1', branch.id);

    expect(branch.parentSessionId).toBe('session-1');
    expect(branch.parentSnapshotId).toBe('snapshot-1');
    expect(branch.branchLabel).toBe('Chosen Snapshot');
    expect(branch.state).toEqual({ workflowGraph: { nodes: [{ id: 'snap-1' }], edges: [] }, note: 'snapshot-one' });
    expect(bundle.lineage.parent?.id).toBe('session-1');
    expect(bundle.messages).toEqual([]);
    expect(bundle.events).toEqual([]);
    expect(db.tables.nl_studio_messages).toHaveLength(1);
    expect(db.tables.nl_studio_events).toHaveLength(1);
  });

  it('uses the latest snapshot when no snapshot id is provided', async () => {
    const branch = await createStudioSessionBranch({
      ownerAgentId: 'agent-1',
      sessionId: 'session-1',
      title: 'Latest Snapshot Branch',
    });

    expect(branch.parentSessionId).toBe('session-1');
    expect(branch.parentSnapshotId).toBe('snapshot-2');
    expect(branch.branchLabel).toBe('Latest');
    expect(branch.state).toEqual({ workflowGraph: { nodes: [{ id: 'snap-2' }], edges: [] }, note: 'snapshot-two' });
  });
});
