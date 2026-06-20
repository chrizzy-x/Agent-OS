import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSupabase } from '../setup.js';

const panicMocks = vi.hoisted(() => ({
  isExecutionActiveStatus: vi.fn(),
  listExecutions: vi.fn(),
  requestExecutionAction: vi.fn(),
}));

vi.mock('../../src/execution/service.js', () => ({
  isExecutionActiveStatus: panicMocks.isExecutionActiveStatus,
  listExecutions: panicMocks.listExecutions,
  requestExecutionAction: panicMocks.requestExecutionAction,
}));

import { assertMcpRuntimeAllowed, executePanicAction, getPanicStatus } from '../../src/panic/service.js';

type Row = Record<string, unknown>;

function createRuntimeDb() {
  const tables: Record<string, Row[]> = {
    agent_runtime_controls: [],
    vault_runtime_grants: [],
  };

  function applyFilters(rows: Row[], filters: Array<{ field: string; value: unknown }>) {
    return rows.filter(row => filters.every(filter => row[filter.field] === filter.value));
  }

  function builder(table: string) {
    const filters: Array<{ field: string; value: unknown }> = [];
    let updatePayload: Row | null = null;
    const query = {
      select: vi.fn().mockReturnThis(),
      eq(field: string, value: unknown) {
        filters.push({ field, value });
        return query;
      },
      maybeSingle() {
        return Promise.resolve({ data: applyFilters(tables[table] ?? [], filters)[0] ?? null, error: null });
      },
      update(payload: Row) {
        updatePayload = payload;
        return query;
      },
      upsert(payload: Row, options?: { onConflict?: string }) {
        const rows = tables[table] ?? [];
        const keys = (options?.onConflict ?? 'id').split(',').map(item => item.trim());
        const index = rows.findIndex(row => keys.every(key => row[key] === payload[key]));
        if (index >= 0) rows[index] = { ...rows[index], ...payload };
        else rows.push({ ...payload });
        tables[table] = rows;
        return query;
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        let rows = applyFilters(tables[table] ?? [], filters);
        if (updatePayload) {
          rows.forEach(row => Object.assign(row, updatePayload));
        }
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      },
    };
    return query;
  }

  return { tables, builder };
}

describe('panic service', () => {
  let db: ReturnType<typeof createRuntimeDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createRuntimeDb();
    mockSupabase.from.mockImplementation(db.builder);
    panicMocks.isExecutionActiveStatus.mockImplementation((status: string) => ['QUEUED', 'RUNNING', 'PAUSED', 'queued', 'running', 'paused'].includes(status));
    panicMocks.requestExecutionAction.mockImplementation(async ({ executionId, action }) => ({ id: executionId, status: action === 'pause' ? 'paused' : 'cancelled' }));
  });

  it('infers healthy, warning, and heavy activity states from active executions', async () => {
    panicMocks.listExecutions.mockResolvedValueOnce([]);
    await expect(getPanicStatus({ agentId: 'agent-1' })).resolves.toMatchObject({ state: 'healthy', activeCount: 0 });

    panicMocks.listExecutions.mockResolvedValueOnce([{ id: 'exec-1', status: 'running' }]);
    await expect(getPanicStatus({ agentId: 'agent-1' })).resolves.toMatchObject({ state: 'warning', activeCount: 1 });

    panicMocks.listExecutions.mockResolvedValueOnce(Array.from({ length: 5 }, (_, index) => ({ id: `exec-${index}`, status: 'queued' })));
    await expect(getPanicStatus({ agentId: 'agent-1' })).resolves.toMatchObject({ state: 'heavy_activity', activeCount: 5 });
  });

  it('pauses active executions without disabling runtime connectors', async () => {
    panicMocks.listExecutions
      .mockResolvedValueOnce([{ id: 'exec-1', status: 'running' }])
      .mockResolvedValueOnce([]);

    const result = await executePanicAction({ agentId: 'agent-1', action: 'pause' });

    expect(panicMocks.requestExecutionAction).toHaveBeenCalledWith({ agentId: 'agent-1', executionId: 'exec-1', action: 'pause' });
    expect(result).toMatchObject({ state: 'healthy', affected: 1, mcpDisabled: false, vaultDisabled: false });
  });

  it('lockdown cancels executions, revokes vault grants, and blocks MCP runtime access', async () => {
    db.tables.vault_runtime_grants.push({ id: 'grant-1', owner_agent_id: 'agent-1', status: 'active' });
    panicMocks.listExecutions
      .mockResolvedValueOnce([{ id: 'exec-1', status: 'running' }])
      .mockResolvedValueOnce([]);

    const result = await executePanicAction({ agentId: 'agent-1', workspaceId: 'workspace-1', action: 'lockdown' });

    expect(panicMocks.requestExecutionAction).toHaveBeenCalledWith({ agentId: 'agent-1', executionId: 'exec-1', action: 'cancel' });
    expect(result).toMatchObject({
      state: 'emergency',
      affected: 1,
      mcpDisabled: true,
      vaultDisabled: true,
      requireReauth: true,
      vaultRuntimeGrantsRevoked: 1,
    });
    expect(db.tables.vault_runtime_grants[0].status).toBe('cleaned');
    await expect(assertMcpRuntimeAllowed('agent-1')).rejects.toThrow('MCP is disabled');
  });

  it('skips stale executions but still applies panic to reachable active executions', async () => {
    panicMocks.listExecutions
      .mockResolvedValueOnce([{ id: 'stale-exec', status: 'running' }, { id: 'exec-1', status: 'running' }])
      .mockResolvedValueOnce([]);
    panicMocks.requestExecutionAction.mockImplementation(async ({ executionId, action }) => {
      if (executionId === 'stale-exec') throw new Error('Execution not found');
      return { id: executionId, status: action === 'pause' ? 'paused' : 'cancelled' };
    });

    const result = await executePanicAction({ agentId: 'agent-1', action: 'stop_all' });

    expect(panicMocks.requestExecutionAction).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ state: 'healthy', affected: 1 });
  });

  it('returns a clear validation error when no listed active execution can be changed', async () => {
    panicMocks.listExecutions.mockResolvedValueOnce([{ id: 'stale-exec', status: 'running' }]);
    panicMocks.requestExecutionAction.mockRejectedValue(new Error('Execution not found'));

    await expect(executePanicAction({ agentId: 'agent-1', action: 'stop_all' })).rejects.toThrow('No active executions could be changed');
  });
});
