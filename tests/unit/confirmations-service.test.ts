import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSupabase } from '../setup.js';
import { createConfirmation } from '../../src/confirmations/service.js';

describe('confirmation service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not allow critical confirmations to be downgraded below double approval', async () => {
    let inserted: Record<string, unknown> | null = null;
    mockSupabase.from.mockImplementation((table: string) => ({
      insert: vi.fn((row: Record<string, unknown>) => {
        if (table === 'agent_confirmations') inserted = row;
        return {
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: row, error: null }),
          })),
        };
      }),
      upsert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: {}, error: null }),
        })),
      })),
    }));

    const confirmation = await createConfirmation({
      userId: 'agent-1',
      actionName: 'Use Derek to execute a trade',
      riskLevel: 'critical',
      secretScopes: ['wallet:trade'],
      requiredApprovals: 1,
    });

    expect(inserted?.required_approvals).toBe(2);
    expect(confirmation.requiredApprovals).toBe(2);
  });
});
