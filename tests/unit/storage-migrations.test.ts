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

  it('adds X account management tables behind RLS deny-all policies', () => {
    const sql = readFileSync(join(migrationsDir, '008_x_account_management.sql'), 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS x_account_connections');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS x_post_drafts');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS x_publish_queue');
    expect(sql).toContain('ALTER TABLE x_account_connections ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('CREATE POLICY "deny_all_x_post_metrics"');
  });
  it('adds external agent registration and call tracking primitives', () => {
    const sql = readFileSync(join(migrationsDir, '009_external_agent_connector.sql'), 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS external_agent_registrations');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_ext_reg_agent_id');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION increment_ext_agent_calls');
    expect(sql).toContain('ALTER TABLE external_agent_registrations ENABLE ROW LEVEL SECURITY');
  });

  it('adds durable Studio workflow result tracking', () => {
    const sql = readFileSync(join(migrationsDir, '014_studio_recurring_workflows.sql'), 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS agent_workflows');
    expect(sql).toContain('ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS workflow_id');
    expect(sql).toContain('last_result JSONB');
    expect(sql).toContain('CREATE POLICY "deny_all_agent_workflows"');
  });

  it('adds database-level agent name uniqueness enforcement', () => {
    const sql = readFileSync(join(migrationsDir, '015_unique_agent_names.sql'), 'utf8');

    expect(sql).toContain('CREATE OR REPLACE FUNCTION normalize_agent_name');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION enforce_agent_name_uniqueness');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION enforce_external_agent_name_uniqueness');
    expect(sql).toContain('CREATE TRIGGER agents_name_uniqueness');
    expect(sql).toContain('CREATE TRIGGER external_agent_registrations_name_uniqueness');
    expect(sql).toContain('agents_name_normalized_unique_idx');
  });
});

