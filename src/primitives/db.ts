import { z } from 'zod';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { withAudit } from '../runtime/audit.js';
import { checkTableName, checkSqlSafety } from '../runtime/security.js';
import { validate, sqlSchema } from '../utils/validation.js';
import { ValidationError } from '../utils/errors.js';
import type { AgentContext } from '../auth/permissions.js';

const MAX_ROWS = 10_000;
const QUERY_TIMEOUT_MS = 10_000;

// Get the agent's private schema name
function agentSchema(agentId: string): string {
  return `agent_${agentId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

// Execute a parameterized SQL query against the agent's private schema.
// All queries are scoped to the agent's schema via search_path.
export async function dbQuery(
  ctx: AgentContext,
  input: unknown
): Promise<{ rows: unknown[]; rowCount: number }> {
  const { sql, params } = validate(
    z.object({
      sql: sqlSchema,
      params: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional().default([]),
    }),
    input
  );

  checkSqlSafety(sql);

  return withAudit({ agentId: ctx.agentId, primitive: 'db', operation: 'query' }, async () => {
    const supabase = getSupabaseAdmin();
    const schema = agentSchema(ctx.agentId);

    // Use Supabase's rpc to execute arbitrary SQL within the agent's schema
    // The schema isolation is enforced by wrapping in a SET search_path
    const wrappedSql = `SET search_path TO ${schema}, public; ${sql}`;

    const { data, error } = await supabase.rpc('execute_agent_query', {
      p_schema: schema,
      p_sql: sql,
      p_params: params,
    });

    if (error) {
      throw new Error(`Query failed: ${error.message}`);
    }

    const rows = Array.isArray(data) ? data.slice(0, MAX_ROWS) : (data ? [data] : []);
    return { rows, rowCount: rows.length };
  });
}

// Execute multiple SQL statements as an atomic transaction.
export async function dbTransaction(
  ctx: AgentContext,
  input: unknown
): Promise<{ results: Array<{ rows: unknown[]; rowCount: number }> }> {
  const { queries } = validate(
    z.object({
      queries: z.array(
        z.object({
          sql: sqlSchema,
          params: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional().default([]),
        })
      ).min(1).max(50),
    }),
    input
  );

  for (const q of queries) {
    checkSqlSafety(q.sql);
  }

  return withAudit({ agentId: ctx.agentId, primitive: 'db', operation: 'transaction', metadata: { queryCount: queries.length } }, async () => {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.rpc('execute_agent_transaction', {
      p_schema: agentSchema(ctx.agentId),
      p_queries: queries,
    });

    if (error) {
      throw new Error(`Transaction failed: ${error.message}`);
    }

    return { results: data ?? [] };
  });
}

// Create a table in the agent's private schema.
export async function dbCreateTable(
  ctx: AgentContext,
  input: unknown
): Promise<{ table: string; created: boolean }> {
  const { table, schema } = validate(
    z.object({
      table: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/).max(63),
      schema: z.array(
        z.object({
          column: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/).max(63),
          type: z.enum(['text', 'integer', 'bigint', 'boolean', 'real', 'jsonb', 'timestamptz', 'uuid']),
          nullable: z.boolean().optional().default(true),
          primaryKey: z.boolean().optional().default(false),
          default: z.string().max(100).optional(),
        })
      ).min(1).max(100),
    }),
    input
  );

  const qualifiedTable = checkTableName(ctx.agentId, table);

  return withAudit({ agentId: ctx.agentId, primitive: 'db', operation: 'create_table', metadata: { table } }, async () => {
    const supabase = getSupabaseAdmin();
    const agentSchemaName = agentSchema(ctx.agentId);

    // Ensure schema exists
    await supabase.rpc('ensure_agent_schema', { p_schema: agentSchemaName });

    // Build CREATE TABLE statement from schema definition
    const columnDefs = schema.map(col => {
      let def = `"${col.column}" ${col.type}`;
      if (col.primaryKey) def += ' PRIMARY KEY';
      if (!col.nullable && !col.primaryKey) def += ' NOT NULL';
      if (col.default) def += ` DEFAULT ${col.default}`;
      return def;
    }).join(', ');

    const createSql = `CREATE TABLE IF NOT EXISTS ${qualifiedTable} (${columnDefs})`;

    const { error } = await supabase.rpc('execute_ddl', {
      p_schema: agentSchemaName,
      p_sql: createSql,
    });

    if (error) {
      throw new Error(`Failed to create table: ${error.message}`);
    }

    return { table, created: true };
  });
}

// Insert a row into a table. Returns the inserted row.
export async function dbInsert(
  ctx: AgentContext,
  input: unknown
): Promise<{ table: string; row: unknown }> {
  const { table, data } = validate(
    z.object({
      table: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/).max(63),
      data: z.record(z.unknown()),
    }),
    input
  );

  const qualifiedTable = checkTableName(ctx.agentId, table);

  return withAudit({ agentId: ctx.agentId, primitive: 'db', operation: 'insert', metadata: { table } }, async () => {
    const supabase = getSupabaseAdmin();
    const schema = agentSchema(ctx.agentId);

    const columns = Object.keys(data);
    const values = Object.values(data);

    if (columns.length === 0) {
      throw new ValidationError('Insert data cannot be empty');
    }

    // Use parameterized insertion via RPC
    const { data: result, error } = await supabase.rpc('agent_insert', {
      p_schema: schema,
      p_table: table,
      p_data: data,
    });

    if (error) {
      throw new Error(`Insert failed: ${error.message}`);
    }

    return { table, row: result };
  });
}

// Update rows matching a WHERE condition.
export async function dbUpdate(
  ctx: AgentContext,
  input: unknown
): Promise<{ table: string; updatedCount: number }> {
  const { table, data, where } = validate(
    z.object({
      table: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/).max(63),
      data: z.record(z.unknown()),
      where: z.record(z.unknown()),
    }),
    input
  );

  checkTableName(ctx.agentId, table); // validates table name

  return withAudit({ agentId: ctx.agentId, primitive: 'db', operation: 'update', metadata: { table } }, async () => {
    const supabase = getSupabaseAdmin();
    const schema = agentSchema(ctx.agentId);

    const { data: result, error } = await supabase.rpc('agent_update', {
      p_schema: schema,
      p_table: table,
      p_data: data,
      p_where: where,
    });

    if (error) {
      throw new Error(`Update failed: ${error.message}`);
    }

    return { table, updatedCount: result ?? 0 };
  });
}

// Delete rows matching a WHERE condition.
export async function dbDelete(
  ctx: AgentContext,
  input: unknown
): Promise<{ table: string; deletedCount: number }> {
  const { table, where } = validate(
    z.object({
      table: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/).max(63),
      where: z.record(z.unknown()),
    }),
    input
  );

  checkTableName(ctx.agentId, table);

  return withAudit({ agentId: ctx.agentId, primitive: 'db', operation: 'delete', metadata: { table } }, async () => {
    const supabase = getSupabaseAdmin();
    const schema = agentSchema(ctx.agentId);

    const { data: result, error } = await supabase.rpc('agent_delete', {
      p_schema: schema,
      p_table: table,
      p_where: where,
    });

    if (error) {
      throw new Error(`Delete failed: ${error.message}`);
    }

    return { table, deletedCount: result ?? 0 };
  });
}
