import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSupabase } from '../../setup.js';
import { blockXDraftForAgent, listXDraftsForAgent } from '../../../src/integrations/x/service.js';

describe('X review service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists accessible drafts and merges account metadata', async () => {
    mockSupabase.from
      .mockImplementationOnce((table: string) => {
        expect(table).toBe('x_account_connections');
        return {
          data: [{ id: 'conn-1', username: 'alpha', owner_agent_id: 'owner-1', child_agent_id: 'child-1' }],
          error: null,
          select() { return this; },
          eq() { return this; },
          order() { return this; },
        };
      })
      .mockImplementationOnce((table: string) => {
        expect(table).toBe('x_account_connections');
        return {
          data: [],
          error: null,
          select() { return this; },
          eq() { return this; },
          order() { return this; },
        };
      })
      .mockImplementationOnce((table: string) => {
        expect(table).toBe('x_post_drafts');
        return {
          data: [
            {
              id: 'draft-1',
              account_connection_id: 'conn-1',
              text: 'Draft body',
              approval_status: 'required',
              guardrail_status: 'needs_review',
              guardrail_reasons: ['Needs human review'],
              similarity_score: 0.2,
            },
          ],
          error: null,
          select() { return this; },
          in() { return this; },
          order() { return this; },
          limit() { return this; },
        };
      });

    const drafts = await listXDraftsForAgent('owner-1', { limit: 20 });

    expect(drafts).toHaveLength(1);
    expect(drafts[0].account).toMatchObject({ username: 'alpha' });
    expect(drafts[0].guardrail_reasons).toEqual(['Needs human review']);
  });

  it('blocks a draft and cancels queued publish items', async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const queueCancelEq = vi.fn().mockResolvedValue({ error: null });

    mockSupabase.from
      .mockImplementationOnce((table: string) => {
        expect(table).toBe('x_post_drafts');
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: 'draft-1',
              account_connection_id: 'conn-1',
              approval_status: 'required',
              guardrail_status: 'needs_review',
              guardrail_reasons: ['Needs review'],
            },
            error: null,
          }),
        };
      })
      .mockImplementationOnce((table: string) => {
        expect(table).toBe('x_account_connections');
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: 'conn-1',
              owner_agent_id: 'owner-1',
              child_agent_id: 'child-1',
              status: 'active',
            },
            error: null,
          }),
        };
      })
      .mockImplementationOnce((table: string) => {
        expect(table).toBe('x_post_drafts');
        return {
          update: vi.fn().mockReturnValue({ eq: updateEq }),
        };
      })
      .mockImplementationOnce((table: string) => {
        expect(table).toBe('x_publish_queue');
        return {
          select() { return this; },
          eq() { return this; },
          then: undefined,
          data: [
            { id: 'queue-1', publish_status: 'queued' },
            { id: 'queue-2', publish_status: 'published' },
          ],
          error: null,
        };
      })
      .mockImplementationOnce((table: string) => {
        expect(table).toBe('x_publish_queue');
        return {
          update: vi.fn().mockReturnValue({ eq: queueCancelEq }),
        };
      });

    const result = await blockXDraftForAgent('owner-1', 'draft-1', 'Blocked by review');

    expect(result).toMatchObject({ blocked: true, canceledQueueItems: 1 });
    expect(updateEq).toHaveBeenCalledWith('id', 'draft-1');
    expect(queueCancelEq).toHaveBeenCalledWith('id', 'queue-1');
  });
});