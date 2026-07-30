import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSupabase } from '../setup.js';

const serviceMocks = vi.hoisted(() => ({
  assertWorkspaceMembership: vi.fn(),
  logSuperAgentAudit: vi.fn(),
  runSingleIntelligenceRuntime: vi.fn(),
}));

vi.mock('../../src/workspaces/service.js', () => ({
  assertWorkspaceMembership: serviceMocks.assertWorkspaceMembership,
}));

vi.mock('../../src/audit/super-agent.js', () => ({
  logSuperAgentAudit: serviceMocks.logSuperAgentAudit,
}));

vi.mock('../../src/intelligence/runtime.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/intelligence/runtime.js')>('../../src/intelligence/runtime.js');
  return {
    ...actual,
    runSingleIntelligenceRuntime: serviceMocks.runSingleIntelligenceRuntime,
  };
});

import { cancelMultiIntelligenceRun, runMultiIntelligenceWorkers } from '../../src/intelligence/workers.js';

type Row = Record<string, unknown>;

function maybeSingleBuilder(data: unknown, error: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
}

function insertBuilder(capture: (row: Row) => Row) {
  return {
    insert: vi.fn((row: Row) => {
      const next = capture(row);
      return {
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: next, error: null }),
        }),
      };
    }),
  };
}

function updateBuilder(capture: (row: Row) => Row) {
  return {
    update: vi.fn((row: Row) => {
      const next = capture(row);
      const chain = {
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: next, error: null }),
        }),
      };
      return chain;
    }),
  };
}

function connectionBuilder(records: Row[]) {
  let selectedId = '';
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn((column: string, value: string) => {
      if (column === 'id') selectedId = value;
      return builder;
    }),
    maybeSingle: vi.fn(async () => ({
      data: records.find(record => record.id === selectedId) ?? null,
      error: null,
    })),
  };
  return builder;
}

function updateByIdBuilder(rows: Row[]) {
  let patch: Row = {};
  let selectedId = '';
  const builder = {
    update: vi.fn((row: Row) => {
      patch = row;
      return builder;
    }),
    eq: vi.fn((column: string, value: string) => {
      if (column === 'id') selectedId = value;
      return builder;
    }),
    in: vi.fn().mockResolvedValue({ data: [], error: null }),
    select: vi.fn().mockReturnValue({
      single: vi.fn(async () => {
        const index = rows.findIndex(row => row.id === selectedId);
        const safeIndex = index >= 0 ? index : 0;
        const next = { ...rows[safeIndex], ...patch };
        rows[safeIndex] = next;
        return { data: next, error: null };
      }),
    }),
  };
  return builder;
}

function connection(id: string, vendor: 'openai' | 'anthropic' = 'openai', model = 'gpt-5') {
  return {
    id,
    owner_agent_id: 'agent-1',
    workspace_id: 'workspace-1',
    vault_secret_id: `secret-${id}`,
    vendor,
    display_name: id,
    status: 'active',
    selected_model_id: model,
    available_models: [model],
    capabilities: {},
    health: {},
  };
}

describe('multi-intelligence workers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.assertWorkspaceMembership.mockResolvedValue({ workspace: { id: 'workspace-1' }, role: 'owner' });
    serviceMocks.logSuperAgentAudit.mockResolvedValue('audit-1');
  });

  it('stores isolated worker outputs and usage totals', async () => {
    const runs: Row[] = [];
    const outputs: Row[] = [];
    let runUpdates = 0;

    serviceMocks.runSingleIntelligenceRuntime
      .mockResolvedValueOnce({
        text: 'Worker one says Authorization: Bearer secret-token-value',
        invocation: { id: 'invocation-1' },
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        finishReason: 'stop',
      })
      .mockResolvedValueOnce({
        text: 'Worker two output',
        invocation: { id: 'invocation-2' },
        usage: { inputTokens: 4, outputTokens: 5, totalTokens: 9 },
        finishReason: 'stop',
      });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'intelligence_connections') {
        return connectionBuilder([
          connection('connection-1', 'openai', 'gpt-5'),
          connection('connection-2', 'anthropic', 'claude-opus-4-1'),
        ]);
      }
      if (table === 'intelligence_worker_runs') {
        return {
          ...insertBuilder(row => {
            const next = { ...row, id: 'run-1' };
            runs.push(next);
            return next;
          }),
          ...updateBuilder(row => {
            runUpdates += 1;
            const next = {
              ...runs[0],
              ...row,
              id: 'run-1',
              status: row.status ?? (runUpdates === 1 ? 'running' : 'completed'),
            };
            runs[0] = next;
            return next;
          }),
        };
      }
      if (table === 'intelligence_worker_outputs') {
        return {
          ...insertBuilder(row => {
            const next = { ...row, id: `worker-output-${outputs.length + 1}` };
            outputs.push(next);
            return next;
          }),
          ...updateByIdBuilder(outputs),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await runMultiIntelligenceWorkers({
      ownerAgentId: 'agent-1',
      workspaceId: 'workspace-1',
      workspaceContext: {
        metadata: { contextVersion: 'context-v1' },
        capabilityGraph: { graphVersion: 'graph-v1', summary: {}, availableCapabilities: [], needsConfiguration: [] },
        runtimeRegistry: { contract: {} },
        vault: { availableSecretMetadataOnly: [] },
        workspace: { installedApps: [], installedSkills: [], activeWorkflows: [], subagents: [], mcpConnections: [] },
      } as never,
      message: 'Compare approaches',
      workers: [
        {
          workerKey: 'openai-worker',
          selection: {
            mode: 'single',
            connectionId: 'connection-1',
            modelId: 'gpt-5',
            consensusConfigurationId: null,
            selectionSource: 'message',
          },
        },
        {
          workerKey: 'anthropic-worker',
          selection: {
            mode: 'single',
            connectionId: 'connection-2',
            modelId: 'claude-opus-4-1',
            consensusConfigurationId: null,
            selectionSource: 'message',
          },
        },
      ],
    });

    expect(result.run.status).toBe('completed');
    expect(result.run.usage).toEqual({ inputTokens: 5, outputTokens: 7, totalTokens: 12 });
    expect(result.workers).toHaveLength(2);
    expect(result.workers[0].output.isolated).toBe(true);
    expect(JSON.stringify(result.workers)).not.toContain('secret-token-value');
    expect(serviceMocks.runSingleIntelligenceRuntime).toHaveBeenCalledTimes(2);
    expect(serviceMocks.runSingleIntelligenceRuntime).toHaveBeenCalledWith(expect.objectContaining({
      purpose: 'multi_worker',
      message: expect.stringContaining('Worker key: openai-worker.'),
    }));
    expect(serviceMocks.logSuperAgentAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'intelligence.worker_run_completed',
      success: true,
    }));
  });

  it('cancels durable runs and queued worker outputs', async () => {
    let cancelledRun: Row | null = null;
    let workerPatch: Row | null = null;

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'intelligence_worker_runs') {
        return updateBuilder(row => {
          cancelledRun = {
            id: 'run-1',
            owner_agent_id: 'agent-1',
            workspace_id: 'workspace-1',
            status: row.status,
            worker_count: 2,
            metadata: {},
            usage: {},
            created_at: '2026-07-24T12:00:00.000Z',
            updated_at: '2026-07-24T12:00:00.000Z',
          };
          return cancelledRun;
        });
      }
      if (table === 'intelligence_worker_outputs') {
        return {
          update: vi.fn((row: Row) => {
            workerPatch = row;
            return {
              eq: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({ data: [], error: null }),
            };
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await cancelMultiIntelligenceRun({
      ownerAgentId: 'agent-1',
      runId: 'run-1',
    });

    expect(result.status).toBe('cancelled');
    expect(cancelledRun?.status).toBe('cancelled');
    expect(workerPatch).toMatchObject({
      status: 'cancelled',
      error_code: 'cancelled',
    });
  });
});
