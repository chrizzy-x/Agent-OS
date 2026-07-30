import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSupabase } from '../setup.js';

const serviceMocks = vi.hoisted(() => ({
  assertWorkspaceMembership: vi.fn(),
  logSuperAgentAudit: vi.fn(),
  runMultiIntelligenceWorkers: vi.fn(),
}));

vi.mock('../../src/workspaces/service.js', () => ({
  assertWorkspaceMembership: serviceMocks.assertWorkspaceMembership,
}));

vi.mock('../../src/audit/super-agent.js', () => ({
  logSuperAgentAudit: serviceMocks.logSuperAgentAudit,
}));

vi.mock('../../src/intelligence/workers.js', () => ({
  runMultiIntelligenceWorkers: serviceMocks.runMultiIntelligenceWorkers,
}));

import {
  resolveStandardConsensusConfiguration,
  runStandardConsensusRuntime,
} from '../../src/intelligence/consensus.js';

type Row = Record<string, unknown>;

function maybeSingleBuilder(data: unknown, error: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
}

function listBuilder(result: { data: unknown[]; error: unknown }) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: vi.fn((resolve, reject) => Promise.resolve(result).then(resolve, reject)),
  };
  return builder;
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
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: next, error: null }),
        }),
      };
      return chain;
    }),
  };
}

function configuration() {
  return {
    id: 'standard-config-1',
    owner_agent_id: 'agent-1',
    workspace_id: 'workspace-1',
    display_name: 'Standard Consensus',
    status: 'active',
    strategy: 'standard',
    quorum_count: 2,
    preserve_dissent: true,
    worker_selections: [
      {
        workerKey: 'openai-worker',
        label: 'OpenAI GPT-5',
        selection: {
          mode: 'single',
          connectionId: 'connection-1',
          modelId: 'gpt-5',
          consensusConfigurationId: null,
          selectionSource: 'workspace',
        },
      },
      {
        workerKey: 'anthropic-worker',
        label: 'Claude Opus',
        selection: {
          mode: 'single',
          connectionId: 'connection-2',
          modelId: 'claude-opus-4-1',
          consensusConfigurationId: null,
          selectionSource: 'workspace',
        },
      },
    ],
    metadata: {},
    created_at: '2026-07-24T12:00:00.000Z',
    updated_at: '2026-07-24T12:00:00.000Z',
  };
}

describe('Standard Consensus runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.assertWorkspaceMembership.mockResolvedValue({ workspace: { id: 'workspace-1' }, role: 'owner' });
    serviceMocks.logSuperAgentAudit.mockResolvedValue('audit-1');
  });

  it('stores hashable consensus records while preserving dissent', async () => {
    const records: Row[] = [];
    serviceMocks.runMultiIntelligenceWorkers.mockResolvedValue({
      run: {
        id: 'worker-run-1',
        ownerAgentId: 'agent-1',
        workspaceId: 'workspace-1',
        status: 'completed',
        workerCount: 2,
        completedCount: 2,
        failedCount: 0,
        cancelledCount: 0,
        usage: { inputTokens: 7, outputTokens: 11, totalTokens: 18 },
        metadata: {},
        createdAt: '2026-07-24T12:00:00.000Z',
        updatedAt: '2026-07-24T12:00:00.000Z',
      },
      workers: [
        {
          id: 'output-1',
          workerKey: 'openai-worker',
          status: 'completed',
          outputHash: 'hash-one',
          output: { text: 'Create the project after approval.' },
          usage: { inputTokens: 3, outputTokens: 5, totalTokens: 8 },
        },
        {
          id: 'output-2',
          workerKey: 'anthropic-worker',
          status: 'completed',
          outputHash: 'hash-two',
          output: { text: 'Create a task first, then the project.' },
          usage: { inputTokens: 4, outputTokens: 6, totalTokens: 10 },
        },
      ],
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'intelligence_consensus_configurations') {
        return maybeSingleBuilder(configuration());
      }
      if (table === 'intelligence_consensus_records') {
        return {
          ...insertBuilder(row => {
            const next = { ...row, id: 'consensus-record-1' };
            records.push(next);
            return next;
          }),
          ...updateBuilder(row => {
            const next = { ...records[0], ...row, id: 'consensus-record-1' };
            records[0] = next;
            return next;
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await runStandardConsensusRuntime({
      ownerAgentId: 'agent-1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      selection: {
        mode: 'consensus',
        connectionId: null,
        modelId: null,
        consensusConfigurationId: 'standard-config-1',
        selectionSource: 'message',
      },
      workspaceContext: {
        metadata: { contextVersion: 'context-v1' },
        capabilityGraph: { graphVersion: 'graph-v1', summary: {}, availableCapabilities: [], needsConfiguration: [] },
        runtimeRegistry: { contract: {} },
        vault: { availableSecretMetadataOnly: [] },
        workspace: { installedApps: [], installedSkills: [], activeWorkflows: [], subagents: [], mcpConnections: [] },
      } as never,
      message: 'Create project Launch Plan',
      intent: 'PROJECT_TASK',
    });

    expect(result.trace).toEqual(expect.objectContaining({
      kind: 'standard_consensus',
      executionAuthority: 'super_agentos',
      connectedIntelligenceRole: 'proposal_only',
      consensusRecordId: 'consensus-record-1',
      workerRunId: 'worker-run-1',
      dissentCount: 1,
    }));
    expect(result.record.consensusHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.record.dissent).toHaveLength(1);
    expect(JSON.stringify(result.record)).toContain('Create a task first');
    expect(JSON.stringify(result.record)).not.toContain('FFP Enabled');
    expect(result.text).toContain('Standard Consensus result');
    expect(result.text).toContain('Super AgentOS has not executed');
    expect(serviceMocks.runMultiIntelligenceWorkers).toHaveBeenCalledWith(expect.objectContaining({
      workers: expect.arrayContaining([
        expect.objectContaining({ workerKey: 'openai-worker' }),
        expect.objectContaining({ workerKey: 'anthropic-worker' }),
      ]),
      message: expect.stringContaining('Standard Consensus worker review for Super AgentOS.'),
    }));
    expect(serviceMocks.logSuperAgentAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'intelligence.standard_consensus_completed',
      success: true,
    }));
  });

  it('does not silently replace missing consensus workers with Native', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'intelligence_connections') {
        return listBuilder({
          data: [
            {
              id: 'connection-1',
              vendor: 'openai',
              display_name: 'OpenAI',
              selected_model_id: 'gpt-5',
              status: 'active',
            },
          ],
          error: null,
        });
      }
      throw new Error(`unexpected table ${table}`);
    });

    await expect(resolveStandardConsensusConfiguration({
      ownerAgentId: 'agent-1',
      workspaceId: 'workspace-1',
      consensusConfigurationId: 'standard',
    })).rejects.toThrow('at least two active connected intelligence connections');
    expect(serviceMocks.runMultiIntelligenceWorkers).not.toHaveBeenCalled();
  });

  it('scopes stored consensus configurations by owner and workspace', async () => {
    const eqCalls: Array<[string, string]> = [];
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'intelligence_consensus_configurations') {
        const builder = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn((column: string, value: string) => {
            eqCalls.push([column, value]);
            return builder;
          }),
          maybeSingle: vi.fn().mockResolvedValue({ data: configuration(), error: null }),
        };
        return builder;
      }
      throw new Error(`unexpected table ${table}`);
    });

    await resolveStandardConsensusConfiguration({
      ownerAgentId: 'agent-1',
      workspaceId: 'workspace-1',
      consensusConfigurationId: 'standard-config-1',
    });

    expect(eqCalls).toEqual(expect.arrayContaining([
      ['id', 'standard-config-1'],
      ['owner_agent_id', 'agent-1'],
      ['workspace_id', 'workspace-1'],
    ]));
  });
});
