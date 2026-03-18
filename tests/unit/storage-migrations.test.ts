import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const migrationsDir = join(process.cwd(), 'src', 'storage', 'migrations');

describe('storage migrations', () => {
  it('binds db transaction parameters inside the SQL migration', () => {
    const sql = readFileSync(join(migrationsDir, '002_agent_db_functions.sql'), 'utf8');

    expect(sql).toContain('CASE jsonb_array_length(v_params)');
    expect(sql).toContain('EXECUTE v_sql USING');
    expect(sql).toContain("COALESCE(v_query->'params', '[]'::JSONB)");
  });

  it('adds database-level email normalization and uniqueness enforcement', () => {
    const sql = readFileSync(join(migrationsDir, '007_security_hardening.sql'), 'utf8');

    expect(sql).toContain('CREATE OR REPLACE FUNCTION normalize_agent_email');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION enforce_agent_email_uniqueness');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('CREATE TRIGGER agents_email_uniqueness');
    expect(sql).toContain('agents_metadata_email_normalized_idx');
  });
});
