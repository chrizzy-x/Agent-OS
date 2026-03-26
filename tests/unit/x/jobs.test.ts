import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSupabase } from '../../setup.js';

vi.mock('../../../src/integrations/x/service.js', () => ({
  xPublishNow: vi.fn(),
  xMentionsPull: vi.fn(),
  xMetricsSync: vi.fn(),
}));

import { runXMetricsCron, runXMentionsCron, runXPublishCron } from '../../../src/integrations/x/jobs.js';
import { xMentionsPull, xMetricsSync, xPublishNow } from '../../../src/integrations/x/service.js';

function createQueueQuery(rows: Array<Record<string, unknown>>) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  };
}

function createConnectionSingle(row: Record<string, unknown> | null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
  };
}

function createConnectionList(rows: Array<Record<string, unknown>>) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
}

describe('X cron jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('publishes due queued X posts through the child agent context', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'x_publish_queue') {
        return createQueueQuery([
          {
            id: 'queue-1',
            account_connection_id: '11111111-1111-1111-1111-111111111111',
            attempt_count: 0,
            scheduled_for: '2025-01-01T00:00:00.000Z',
          },
        ]);
      }

      if (table === 'x_account_connections') {
        return createConnectionSingle({
          id: '11111111-1111-1111-1111-111111111111',
          child_agent_id: 'child-agent-1',
          username: 'founder',
          status: 'active',
        });
      }

      throw new Error(`Unexpected table ${table}`);
    });

    vi.mocked(xPublishNow).mockResolvedValue({ postId: 'tweet-1' });

    const result = await runXPublishCron(10);

    expect(result.processed).toBe(1);
    expect(result.published).toBe(1);
    expect(result.failed).toBe(0);
    expect(xPublishNow).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'child-agent-1' }),
      { queueId: 'queue-1' }
    );
  });

  it('runs mention sync across active X account connections', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'x_account_connections') {
        return createConnectionList([
          { id: '11111111-1111-1111-1111-111111111111', child_agent_id: 'child-1', username: 'alpha', status: 'active' },
          { id: '22222222-2222-2222-2222-222222222222', child_agent_id: 'child-2', username: 'beta', status: 'active' },
        ]);
      }

      throw new Error(`Unexpected table ${table}`);
    });

    vi.mocked(xMentionsPull)
      .mockResolvedValueOnce({ mentions: [{ id: 'm1' }] })
      .mockResolvedValueOnce({ mentions: [] });

    const result = await runXMentionsCron(10, 15);

    expect(result.processed).toBe(2);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
    expect(xMentionsPull).toHaveBeenNthCalledWith(1, expect.objectContaining({ agentId: 'child-1' }), {
      accountConnectionId: '11111111-1111-1111-1111-111111111111',
      limit: 15,
    });
  });

  it('records failed metrics syncs without stopping the full cron pass', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'x_account_connections') {
        return createConnectionList([
          { id: '11111111-1111-1111-1111-111111111111', child_agent_id: 'child-1', username: 'alpha', status: 'active' },
          { id: '22222222-2222-2222-2222-222222222222', child_agent_id: 'child-2', username: 'beta', status: 'active' },
        ]);
      }

      throw new Error(`Unexpected table ${table}`);
    });

    vi.mocked(xMetricsSync)
      .mockResolvedValueOnce({ syncedPosts: 4 })
      .mockRejectedValueOnce(new Error('rate limited'));

    const result = await runXMetricsCron(10, 20);

    expect(result.processed).toBe(2);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results[1]).toMatchObject({ status: 'failed', error: 'rate limited' });
  });
});