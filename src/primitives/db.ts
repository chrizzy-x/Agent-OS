import { z } from 'zod';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { withAudit } from '../runtime/audit.js';
import { checkTableName, checkSqlSafety } from '../runtime/security.js';
import { validate, sqlSchema } from '../utils/validation.js';
import { SecurityError, ValidationError } from '../utils/errors.js';
import { getFFPClient } from '../ffp/client.js';
import { updateLocalRuntimeState } from '../storage/local-state.js';
import type { LocalDbColumn, LocalDbTable, LocalRuntimeState } from '../storage/local-state.js';
import type { AgentContext } from '../auth/permissions.js';

const MAX_ROWS = 10_000;

type DbScalar = string | number | boolean | null;

type QueryResult = {
  rows: unknown[];
  rowCount: number;
};

function agentSchema(agentId: string): string {
  return `agent_${agentId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

function getAgentTables(state: LocalRuntimeState, agentId: string): Record<string, LocalDbTable> {
  state.db[agentId] ??= {};
  return state.db[agentId];
}

function normalizeTableReference(value: string): string {
  return value.replace(/"/g, '').split('.').pop() ?? value;
}

function ensureLocalTable(state: LocalRuntimeState, agentId: string, tableName: string): LocalDbTable {
  const table = getAgentTables(state, agentId)[tableName];
  if (!table) {
    throw new ValidationError(`Table '${tableName}' does not exist`);
  }
  return table;
}

function parseValueToken(token: string, params: unknown[]): unknown {
  const trimmed = token.trim();

  if (/^\$\d+$/.test(trimmed)) {
    const index = Number.parseInt(trimmed.slice(1), 10) - 1;
    return params[index] ?? null;
  }

  if (/^'.*'$/.test(trimmed)) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }

  if (/^null$/i.test(trimmed)) {
    return null;
  }

  if (/^true$/i.test(trimmed)) {
    return true;
  }

  if (/^false$/i.test(trimmed)) {
    return false;
  }

  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return trimmed.includes('.') ? Number.parseFloat(trimmed) : Number.parseInt(trimmed, 10);
  }

  return trimmed.replace(/"/g, '');
}

function parseIdentifiers(segment: string): string[] {
  return segment
    .split(',')
    .map(value => value.trim().replace(/"/g, ''))
    .filter(Boolean);
}

function buildWhereMatcher(whereClause: string | undefined, params: unknown[]): (row: Record<string, unknown>) => boolean {
  if (!whereClause) {
    return () => true;
  }

  const conditions = whereClause
    .split(/\s+AND\s+/i)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const match = part.match(/^"?([a-zA-Z][a-zA-Z0-9_]*)"?\s*=\s*(.+)$/i);
      if (!match) {
        throw new ValidationError(`Unsupported WHERE clause: ${part}`);
      }

      return {
        column: match[1],
        value: parseValueToken(match[2], params),
      };
    });

  return (row: Record<string, unknown>) => conditions.every(condition => row[condition.column] === condition.value);
}

function executeLocalSql(state: LocalRuntimeState, agentId: string, sql: string, params: unknown[]): QueryResult {
  const trimmed = sql.trim().replace(/;$/, '');

  if (/^SELECT\s+1$/i.test(trimmed)) {
    return { rows: [{ value: 1 }], rowCount: 1 };
  }

  const createMatch = trimmed.match(/^CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-zA-Z0-9_\."]+)\s*\((.+)\)$/i);
  if (createMatch) {
    const tableName = normalizeTableReference(createMatch[1]);
    const columns = createMatch[2]
      .split(',')
      .map(part => part.trim())
      .filter(Boolean)
      .map(definition => {
        const match = definition.match(/^"?([a-zA-Z][a-zA-Z0-9_]*)"?\s+([a-zA-Z0-9_]+)(.*)$/i);
        if (!match) {
          throw new ValidationError(`Unsupported column definition: ${definition}`);
        }

        return {
          column: match[1],
          type: match[2].toLowerCase(),
          nullable: !/NOT\s+NULL/i.test(match[3]) && !/PRIMARY\s+KEY/i.test(match[3]),
          primaryKey: /PRIMARY\s+KEY/i.test(match[3]),
        } as LocalDbColumn;
      });

    getAgentTables(state, agentId)[tableName] ??= { schema: columns, rows: [], autoIncrement: 1 };
    return { rows: [], rowCount: 0 };
  }

  const insertMatch = trimmed.match(/^INSERT\s+INTO\s+([a-zA-Z0-9_\."]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)$/i);
  if (insertMatch) {
    const tableName = normalizeTableReference(insertMatch[1]);
    const table = ensureLocalTable(state, agentId, tableName);
    const columns = parseIdentifiers(insertMatch[2]);
    const values = insertMatch[3].split(',').map(value => parseValueToken(value, params));
    const row: Record<string, unknown> = {};

    columns.forEach((column, index) => {
      row[column] = values[index] ?? null;
    });

    if (!('id' in row)) {
      row.id = table.autoIncrement;
      table.autoIncrement += 1;
    }

    table.rows.push(row);
    return { rows: [row], rowCount: 1 };
  }

  const selectMatch = trimmed.match(/^SELECT\s+(.+)\s+FROM\s+([a-zA-Z0-9_\."]+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER\s+BY\s+([a-zA-Z0-9_"]+)(?:\s+(ASC|DESC))?)?(?:\s+LIMIT\s+(\d+))?$/i);
  if (selectMatch) {
    const tableName = normalizeTableReference(selectMatch[2]);
    const table = ensureLocalTable(state, agentId, tableName);
    const matcher = buildWhereMatcher(selectMatch[3], params);
    const selectedColumns = selectMatch[1].trim() === '*'
      ? null
      : parseIdentifiers(selectMatch[1]);
    const orderBy = selectMatch[4] ? selectMatch[4].replace(/"/g, '') : null;
    const orderDirection = (selectMatch[5] ?? 'ASC').toUpperCase();
    const limit = selectMatch[6] ? Number.parseInt(selectMatch[6], 10) : MAX_ROWS;

    let rows = table.rows.filter(row => matcher(row)).map(row => ({ ...row }));
    if (orderBy) {
      rows = rows.sort((left, right) => {
        const leftValue = left[orderBy] as DbScalar | undefined;
        const rightValue = right[orderBy] as DbScalar | undefined;
        if (leftValue === rightValue) {
          return 0;
        }
        if (leftValue === undefined || leftValue === null) {
          return orderDirection === 'DESC' ? 1 : -1;
        }
        if (rightValue === undefined || rightValue === null) {
          return orderDirection === 'DESC' ? -1 : 1;
        }
        return leftValue > rightValue ? (orderDirection === 'DESC' ? -1 : 1) : (orderDirection === 'DESC' ? 1 : -1);
      });
    }

    const limited = rows.slice(0, Math.min(limit, MAX_ROWS));
    const projected = selectedColumns
      ? limited.map(row => Object.fromEntries(selectedColumns.map(column => [column, row[column]])))
      : limited;

    return { rows: projected, rowCount: projected.length };
  }

  const updateMatch = trimmed.match(/^UPDATE\s+([a-zA-Z0-9_\."]+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?$/i);
  if (updateMatch) {
    const tableName = normalizeTableReference(updateMatch[1]);
    const table = ensureLocalTable(state, agentId, tableName);
    const assignments = updateMatch[2]
      .split(',')
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        const match = part.match(/^"?([a-zA-Z][a-zA-Z0-9_]*)"?\s*=\s*(.+)$/i);
        if (!match) {
          throw new ValidationError(`Unsupported SET clause: ${part}`);
        }
        return {
          column: match[1],
          value: parseValueToken(match[2], params),
        };
      });
    const matcher = buildWhereMatcher(updateMatch[3], params);
    let updatedCount = 0;

    table.rows = table.rows.map(row => {
      if (!matcher(row)) {
        return row;
      }

      updatedCount += 1;
      const next = { ...row };
      for (const assignment of assignments) {
        next[assignment.column] = assignment.value;
      }
      return next;
    });

    return { rows: [], rowCount: updatedCount };
  }

  const deleteMatch = trimmed.match(/^DELETE\s+FROM\s+([a-zA-Z0-9_\."]+)(?:\s+WHERE\s+(.+))?$/i);
  if (deleteMatch) {
    const tableName = normalizeTableReference(deleteMatch[1]);
    const table = ensureLocalTable(state, agentId, tableName);
    const matcher = buildWhereMatcher(deleteMatch[2], params);
    const before = table.rows.length;
    table.rows = table.rows.filter(row => !matcher(row));
    return { rows: [], rowCount: before - table.rows.length };
  }

  throw new ValidationError(`Unsupported SQL statement: ${trimmed}`);
}

async function withDbFallback<T>(primary: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  try {
    return await primary();
  } catch {
    return fallback();
  }
}

export async function dbQuery(ctx: AgentContext, input: unknown): Promise<{ rows: unknown[]; rowCount: number }> {
  const { sql, params } = validate(
    z.object({
      sql: sqlSchema,
      params: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional().default([]),
    }),
    input,
  );

  checkSqlSafety(sql);

  return withAudit({ agentId: ctx.agentId, primitive: 'db', operation: 'query' }, async () => {
    const result = await withDbFallback(async () => {
      const supabase = getSupabaseAdmin();
      const schema = agentSchema(ctx.agentId);
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
    }, async () => {
      return updateLocalRuntimeState(state => executeLocalSql(state, ctx.agentId, sql, params));
    });

    void getFFPClient().log({ primitive: 'db', action: 'query', params: { sql: sql.slice(0, 200) }, result: { rowCount: result.rowCount }, timestamp: Date.now(), agentId: ctx.agentId });
    return result;
  });
}

export async function dbTransaction(ctx: AgentContext, input: unknown): Promise<{ results: Array<{ rows: unknown[]; rowCount: number }> }> {
  const { queries } = validate(
    z.object({
      queries: z.array(
        z.object({
          sql: sqlSchema,
          params: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional().default([]),
        }),
      ).min(1).max(50),
    }),
    input,
  );

  for (const query of queries) {
    checkSqlSafety(query.sql);
  }

  return withAudit({ agentId: ctx.agentId, primitive: 'db', operation: 'transaction', metadata: { queryCount: queries.length } }, async () => {
    const result = await withDbFallback(async () => {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase.rpc('execute_agent_transaction', {
        p_schema: agentSchema(ctx.agentId),
        p_queries: queries,
      });

      if (error) {
        throw new Error(`Transaction failed: ${error.message}`);
      }

      return { results: (data ?? []) as Array<{ rows: unknown[]; rowCount: number }> };
    }, async () => {
      return updateLocalRuntimeState(state => {
        const snapshot = JSON.parse(JSON.stringify(state.db[ctx.agentId] ?? {})) as Record<string, LocalDbTable>;
        try {
          const results = queries.map(query => executeLocalSql(state, ctx.agentId, query.sql, query.params));
          return { results };
        } catch (error) {
          state.db[ctx.agentId] = snapshot;
          throw error;
        }
      });
    });

    void getFFPClient().log({ primitive: 'db', action: 'transaction', params: { queryCount: queries.length }, result: { resultCount: result.results.length }, timestamp: Date.now(), agentId: ctx.agentId });
    return result;
  });
}

export async function dbCreateTable(ctx: AgentContext, input: unknown): Promise<{ table: string; created: boolean }> {
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
        }),
      ).min(1).max(100),
    }),
    input,
  );

  checkTableName(ctx.agentId, table);

  return withAudit({ agentId: ctx.agentId, primitive: 'db', operation: 'create_table', metadata: { table } }, async () => {
    const result = await withDbFallback(async () => {
      const supabase = getSupabaseAdmin();
      const agentSchemaName = agentSchema(ctx.agentId);
      await supabase.rpc('ensure_agent_schema', { p_schema: agentSchemaName });

      const columnDefs = schema.map(column => {
        let definition = `"${column.column}" ${column.type}`;
        if (column.primaryKey) definition += ' PRIMARY KEY';
        if (!column.nullable && !column.primaryKey) definition += ' NOT NULL';
        if (column.default) definition += ` DEFAULT ${column.default}`;
        return definition;
      }).join(', ');

      const createSql = `CREATE TABLE IF NOT EXISTS ${agentSchemaName}.${table} (${columnDefs})`;
      const { error } = await supabase.rpc('execute_ddl', {
        p_schema: agentSchemaName,
        p_sql: createSql,
      });

      if (error) {
        throw new Error(`Failed to create table: ${error.message}`);
      }

      return { table, created: true };
    }, async () => {
      return updateLocalRuntimeState(state => {
        getAgentTables(state, ctx.agentId)[table] = {
          schema: schema.map(column => ({
            column: column.column,
            type: column.type,
            nullable: column.nullable,
            primaryKey: column.primaryKey,
            default: column.default,
          })),
          rows: getAgentTables(state, ctx.agentId)[table]?.rows ?? [],
          autoIncrement: getAgentTables(state, ctx.agentId)[table]?.autoIncrement ?? 1,
        };
        return { table, created: true };
      });
    });

    void getFFPClient().log({ primitive: 'db', action: 'create_table', params: { table }, result: { created: true }, timestamp: Date.now(), agentId: ctx.agentId });
    return result;
  });
}

export async function dbInsert(ctx: AgentContext, input: unknown): Promise<{ table: string; row: unknown }> {
  const { table, data } = validate(
    z.object({
      table: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/).max(63),
      data: z.record(z.unknown()),
    }),
    input,
  );

  checkTableName(ctx.agentId, table);
  if (Object.keys(data).length === 0) {
    throw new ValidationError('Insert data cannot be empty');
  }

  return withAudit({ agentId: ctx.agentId, primitive: 'db', operation: 'insert', metadata: { table } }, async () => {
    const result = await withDbFallback(async () => {
      const supabase = getSupabaseAdmin();
      const { data: inserted, error } = await supabase.rpc('agent_insert', {
        p_schema: agentSchema(ctx.agentId),
        p_table: table,
        p_data: data,
      });

      if (error) {
        throw new Error(`Insert failed: ${error.message}`);
      }

      return { table, row: inserted };
    }, async () => {
      return updateLocalRuntimeState(state => {
        const target = ensureLocalTable(state, ctx.agentId, table);
        const row: Record<string, unknown> = { ...data };
        if (!('id' in row)) {
          row.id = target.autoIncrement;
          target.autoIncrement += 1;
        }
        target.rows.push(row);
        return { table, row };
      });
    });

    void getFFPClient().log({ primitive: 'db', action: 'insert', params: { table }, result: { success: true }, timestamp: Date.now(), agentId: ctx.agentId });
    return result;
  });
}

export async function dbUpdate(ctx: AgentContext, input: unknown): Promise<{ table: string; updatedCount: number }> {
  const { table, data, where } = validate(
    z.object({
      table: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/).max(63),
      data: z.record(z.unknown()),
      where: z.record(z.unknown()),
    }),
    input,
  );

  checkTableName(ctx.agentId, table);

  return withAudit({ agentId: ctx.agentId, primitive: 'db', operation: 'update', metadata: { table } }, async () => {
    const result = await withDbFallback(async () => {
      const supabase = getSupabaseAdmin();
      const { data: updatedCount, error } = await supabase.rpc('agent_update', {
        p_schema: agentSchema(ctx.agentId),
        p_table: table,
        p_data: data,
        p_where: where,
      });

      if (error) {
        throw new Error(`Update failed: ${error.message}`);
      }

      return { table, updatedCount: updatedCount ?? 0 };
    }, async () => {
      return updateLocalRuntimeState(state => {
        const target = ensureLocalTable(state, ctx.agentId, table);
        let updatedCount = 0;
        target.rows = target.rows.map(row => {
          const matches = Object.entries(where).every(([key, value]) => row[key] === value);
          if (!matches) {
            return row;
          }

          updatedCount += 1;
          return { ...row, ...data };
        });
        return { table, updatedCount };
      });
    });

    void getFFPClient().log({ primitive: 'db', action: 'update', params: { table }, result: { updatedCount: result.updatedCount }, timestamp: Date.now(), agentId: ctx.agentId });
    return result;
  });
}

export async function dbDelete(ctx: AgentContext, input: unknown): Promise<{ table: string; deletedCount: number }> {
  const { table, where } = validate(
    z.object({
      table: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/).max(63),
      where: z.record(z.unknown()),
    }),
    input,
  );

  checkTableName(ctx.agentId, table);

  return withAudit({ agentId: ctx.agentId, primitive: 'db', operation: 'delete', metadata: { table } }, async () => {
    const result = await withDbFallback(async () => {
      const supabase = getSupabaseAdmin();
      const { data: deletedCount, error } = await supabase.rpc('agent_delete', {
        p_schema: agentSchema(ctx.agentId),
        p_table: table,
        p_where: where,
      });

      if (error) {
        throw new Error(`Delete failed: ${error.message}`);
      }

      return { table, deletedCount: deletedCount ?? 0 };
    }, async () => {
      return updateLocalRuntimeState(state => {
        const target = ensureLocalTable(state, ctx.agentId, table);
        const before = target.rows.length;
        target.rows = target.rows.filter(row => !Object.entries(where).every(([key, value]) => row[key] === value));
        return { table, deletedCount: before - target.rows.length };
      });
    });

    void getFFPClient().log({ primitive: 'db', action: 'delete', params: { table }, result: { deletedCount: result.deletedCount }, timestamp: Date.now(), agentId: ctx.agentId });
    return result;
  });
}

