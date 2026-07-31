import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSupabase } from '../setup.js';
import { updateExecution } from '../../src/execution/service.js';

describe('execution service DB compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('omits newer recovery columns from legacy execution update fallback', async () => {
    const updatePayloads: Record<string, unknown>[] = [];
    const rows = [
      {
        data: null,
        error: { code: '42703', message: 'column agent_executions.recovery_action does not exist' },
      },
      {
        data: {
          id: 'execution-1',
          agent_id: 'agent-1',
          source_type: 'workflow',
          title: 'Run workflow',
          status: 'queued',
          created_at: '2026-07-31T00:00:00.000Z',
          updated_at: '2026-07-31T00:00:01.000Z',
        },
        error: null,
      },
    ];

    mockSupabase.from.mockImplementation((table: string) => {
      expect(table).toBe('agent_executions');
      const chain = {
        update: vi.fn((payload: Record<string, unknown>) => {
          updatePayloads.push(payload);
          return chain;
        }),
        eq: vi.fn(() => chain),
        select: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => rows.shift()),
      };
      return chain;
    });

    const result = await updateExecution({
      agentId: 'agent-1',
      executionId: 'execution-1',
      patch: {
        status: 'QUEUED',
        recoveryAction: 'retry',
        recoveryRequestedAt: '2026-07-31T00:00:02.000Z',
        statusDetail: { lastRequestedAction: 'retry' },
      },
    });

    expect(result.status).toBe('QUEUED');
    expect(updatePayloads).toHaveLength(2);
    expect(updatePayloads[0]).toMatchObject({
      status: 'QUEUED',
      recovery_action: 'retry',
      recovery_requested_at: '2026-07-31T00:00:02.000Z',
      status_detail: { lastRequestedAction: 'retry' },
    });
    expect(updatePayloads[1]).toMatchObject({ status: 'queued' });
    expect(updatePayloads[1]).not.toHaveProperty('recovery_action');
    expect(updatePayloads[1]).not.toHaveProperty('recovery_requested_at');
    expect(updatePayloads[1]).not.toHaveProperty('status_detail');
  });
});
