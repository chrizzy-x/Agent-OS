import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockRedis, mockSupabase } from '../setup.js';

const originalNodeEnv = process.env.NODE_ENV;

type TokenRow = {
  key_hash: string;
  value: string;
  expires_at: string;
  updated_at?: string;
};

function installDurableTokenTable(rows: Map<string, TokenRow>) {
  mockSupabase.from.mockImplementation((table: string) => {
    if (table !== 'studio_confirm_tokens') {
      throw new Error(`unexpected table ${table}`);
    }

    let selectedHash = '';
    const selectBuilder = {
      select: vi.fn(() => selectBuilder),
      eq: vi.fn((column: string, value: string) => {
        if (column === 'key_hash') selectedHash = value;
        return selectBuilder;
      }),
      maybeSingle: vi.fn(async () => ({
        data: rows.get(selectedHash) ?? null,
        error: null,
      })),
    };

    return {
      upsert: vi.fn(async (row: TokenRow) => {
        rows.set(row.key_hash, row);
        return { data: null, error: null };
      }),
      select: selectBuilder.select,
      eq: selectBuilder.eq,
      maybeSingle: selectBuilder.maybeSingle,
      delete: vi.fn(() => ({
        eq: vi.fn(async (_column: string, value: string) => {
          rows.delete(value);
          return { data: null, error: null };
        }),
      })),
    };
  });
}

beforeEach(() => {
  process.env.NODE_ENV = 'production';
  mockSupabase.from.mockReset();
  mockRedis.get.mockReset();
  mockRedis.del.mockReset();
  (mockRedis as typeof mockRedis & { setex: ReturnType<typeof vi.fn> }).setex = vi.fn().mockRejectedValue(new Error('redis unavailable'));
  mockRedis.get.mockRejectedValue(new Error('redis unavailable'));
  mockRedis.del.mockRejectedValue(new Error('redis unavailable'));
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe('Studio confirmation tokens', () => {
  it('uses durable hashed storage in production when Redis is unavailable', async () => {
    const rows = new Map<string, TokenRow>();
    installDurableTokenTable(rows);
    const { tokenDel, tokenGet, tokenSet } = await import('../../src/studio/confirm-tokens.js');

    await tokenSet('studio:confirm:test-token', 1800, '{"approved":true}');

    const [storedHash] = rows.keys();
    expect(storedHash).toHaveLength(64);
    expect(storedHash).not.toBe('studio:confirm:test-token');
    expect(await tokenGet('studio:confirm:test-token')).toBe('{"approved":true}');

    await tokenDel('studio:confirm:test-token');
    expect(await tokenGet('studio:confirm:test-token')).toBeNull();
  });
});
