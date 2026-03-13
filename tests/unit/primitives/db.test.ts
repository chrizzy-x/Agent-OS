import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockSupabase } from '../../setup.js';
import { dbQuery, dbCreateTable, dbInsert, dbUpdate, dbDelete, dbTransaction } from '../../../src/primitives/db.js';
import { SecurityError } from '../../../src/utils/errors.js';
import type { AgentContext } from '../../../src/auth/permissions.js';

const ctx: AgentContext = {
  agentId: 'db-agent',
  allowedDomains: [],
  quotas: {
    storageQuotaBytes: 1024 * 1024 * 1024,
    memoryQuotaBytes: 100 * 1024 * 1024,
    rateLimitPerMin: 100,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.rpc.mockResolvedValue({ data: [], error: null });
});

describe('dbQuery', () => {
  it('calls execute_agent_query RPC with correct schema and params', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: [{ id: 1, name: 'Alice' }], error: null });
    const result = await dbQuery(ctx, { sql: 'SELECT * FROM users WHERE id = $1', params: [1] });
    expect(mockSupabase.rpc).toHaveBeenCalledWith('execute_agent_query', {
      p_schema: 'agent_db_agent',
      p_sql: 'SELECT * FROM users WHERE id = $1',
      p_params: [1],
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rowCount).toBe(1);
  });

  it('rejects SQL referencing pg_catalog', async () => {
    await expect(dbQuery(ctx, { sql: 'SELECT * FROM pg_catalog.pg_tables' }))
      .rejects.toThrow(SecurityError);
  });

  it('rejects SQL referencing information_schema', async () => {
    await expect(dbQuery(ctx, { sql: 'SELECT table_name FROM information_schema.tables' }))
      .rejects.toThrow(SecurityError);
  });

  it('handles empty result set', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: [], error: null });
    const result = await dbQuery(ctx, { sql: 'SELECT 1' });
    expect(result.rows).toEqual([]);
    expect(result.rowCount).toBe(0);
  });
});

describe('dbTransaction', () => {
  it('calls execute_agent_transaction with all queries', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: [{ rowCount: 1 }, { rowCount: 2 }], error: null });
    const result = await dbTransaction(ctx, {
      queries: [
        { sql: 'INSERT INTO logs (msg) VALUES ($1)', params: ['hello'] },
        { sql: 'UPDATE counters SET n = n + 1 WHERE name = $1', params: ['clicks'] },
      ],
    });
    expect(mockSupabase.rpc).toHaveBeenCalledWith('execute_agent_transaction', {
      p_schema: 'agent_db_agent',
      p_queries: expect.any(Array),
    });
    expect(result.results).toHaveLength(2);
  });
});

describe('dbCreateTable', () => {
  it('validates schema and calls execute_ddl', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });
    const result = await dbCreateTable(ctx, {
      table: 'users',
      schema: [
        { column: 'id', type: 'uuid', primaryKey: true, nullable: false },
        { column: 'name', type: 'text', nullable: false },
        { column: 'created_at', type: 'timestamptz', nullable: true },
      ],
    });
    expect(result.table).toBe('users');
    expect(result.created).toBe(true);
    // ensure_agent_schema called first, then execute_ddl
    expect(mockSupabase.rpc).toHaveBeenCalledWith('ensure_agent_schema', expect.any(Object));
    expect(mockSupabase.rpc).toHaveBeenCalledWith('execute_ddl', expect.any(Object));
  });

  it('rejects invalid table names', async () => {
    await expect(dbCreateTable(ctx, {
      table: 'DROP TABLE users; --',
      schema: [{ column: 'id', type: 'text' }],
    })).rejects.toThrow();
  });
});

describe('dbInsert', () => {
  it('calls agent_insert RPC with data', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: { id: 'abc', name: 'Alice' }, error: null });
    const result = await dbInsert(ctx, { table: 'users', data: { name: 'Alice' } });
    expect(result.table).toBe('users');
    expect(mockSupabase.rpc).toHaveBeenCalledWith('agent_insert', {
      p_schema: 'agent_db_agent',
      p_table: 'users',
      p_data: { name: 'Alice' },
    });
  });
});

describe('dbUpdate', () => {
  it('calls agent_update RPC', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: 2, error: null });
    const result = await dbUpdate(ctx, { table: 'users', data: { name: 'Bob' }, where: { id: '123' } });
    expect(result.updatedCount).toBe(2);
  });
});

describe('dbDelete', () => {
  it('calls agent_delete RPC', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: 1, error: null });
    const result = await dbDelete(ctx, { table: 'users', where: { id: '123' } });
    expect(result.deletedCount).toBe(1);
  });
});
