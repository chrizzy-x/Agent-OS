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

  it('adds Studio-first plans, Vault, sessions, and private subagents', () => {
    const sql = readFileSync(join(migrationsDir, '016_agentos_studio_vault_plans.sql'), 'utf8');

    expect(sql).toContain("'retail_free'");
    expect(sql).toContain("'enterprise_max'");
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS super_agents');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS nl_studio_sessions');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS nl_studio_events');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS private_subagents');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS vaults');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS vault_secrets');
    expect(sql).toContain('ALTER TABLE vault_secrets ENABLE ROW LEVEL SECURITY');
  });

  it('adds snapshots, SDK credentials, app installs, plan transitions, and Vault lifecycle tables', () => {
    const sql = readFileSync(join(migrationsDir, '017_studio_sdk_vault_lifecycle.sql'), 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS nl_studio_snapshots');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS app_installations');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS sdk_credentials');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS plan_transitions');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS vault_secret_versions');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS vault_permissions');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS vault_assignments');
    expect(sql).toContain('ALTER TABLE sdk_credentials ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain("ALTER TABLE skills ADD COLUMN IF NOT EXISTS publish_state TEXT NOT NULL DEFAULT 'draft'");
    expect(sql).toContain("ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS publish_state TEXT NOT NULL DEFAULT 'draft'");
  });

  it('adds canonical workflow documents for sync across conversation, visual, and code modes', () => {
    const sql = readFileSync(join(migrationsDir, '018_workflow_canonical_document.sql'), 'utf8');

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS canonical_doc JSONB NOT NULL DEFAULT');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS agent_workflows_workspace_idx');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS agent_workflows_canonical_idx');
  });

  it('formalizes kernel registry and visibility-aware app catalog fields', () => {
    const sql = readFileSync(join(migrationsDir, '019_kernel_registry_and_app_visibility.sql'), 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS kernel_registry');
    expect(sql).toContain('UNIQUE (agent_id, product)');
    expect(sql).toContain("ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'internal'");
    expect(sql).toContain("ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'");
    expect(sql).toContain('ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS workspace_id TEXT');
    expect(sql).toContain('ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS screenshots JSONB NOT NULL DEFAULT');
    expect(sql).toContain('ALTER TABLE kernel_registry ENABLE ROW LEVEL SECURITY');
  });

  it('adds sdk heartbeat health and app runtime installation metadata', () => {
    const sql = readFileSync(join(migrationsDir, '020_sdk_health_app_runtime.sql'), 'utf8');

    expect(sql).toContain('ALTER TABLE kernel_registry ADD COLUMN IF NOT EXISTS health_status');
    expect(sql).toContain('ALTER TABLE kernel_registry ADD COLUMN IF NOT EXISTS endpoint_status');
    expect(sql).toContain('ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS heartbeat_count');
    expect(sql).toContain('ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS open_count');
    expect(sql).toContain('ALTER TABLE app_installations ADD COLUMN IF NOT EXISTS favorite');
    expect(sql).toContain("ALTER TABLE app_installations ADD COLUMN IF NOT EXISTS permissions_approved JSONB NOT NULL DEFAULT '[]'::jsonb");
  });

  it('adds app version history, session branching lineage, and Vault runtime subjects', () => {
    const sql = readFileSync(join(migrationsDir, '021_app_versions_session_branching.sql'), 'utf8');

    expect(sql).toContain('ALTER TABLE app_installations ADD COLUMN IF NOT EXISTS installed_version TEXT');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS agent_app_versions');
    expect(sql).toContain('ALTER TABLE nl_studio_sessions ADD COLUMN IF NOT EXISTS parent_session_id');
    expect(sql).toContain('ALTER TABLE nl_studio_sessions ADD COLUMN IF NOT EXISTS parent_snapshot_id');
    expect(sql).toContain("'app', 'skill'");
    expect(sql).toContain('ALTER TABLE agent_app_versions ENABLE ROW LEVEL SECURITY');
  });

  it('adds durable Vault runtime grants with deny-all RLS', () => {
    const sql = readFileSync(join(migrationsDir, '022_vault_runtime_grants.sql'), 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS vault_runtime_grants');
    expect(sql).toContain("CHECK (status IN ('active', 'consumed', 'cleaned', 'expired'))");
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS vault_runtime_grants_owner_idx');
    expect(sql).toContain('ALTER TABLE vault_runtime_grants ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('deny_all_vault_runtime_grants');
  });

  it('formalizes FFP execution logs and removes legacy persisted plan identifiers', () => {
    const sql = readFileSync(join(migrationsDir, '023_ffp_audit_and_plan_cleanup.sql'), 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS ffp_chain_executions');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS fallback_used');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS route_decision JSONB');
    expect(sql).toContain("UPDATE agents\nSET tier = CASE tier");
    expect(sql).toContain("CHECK (tier IN ('retail_free', 'retail_pro', 'enterprise_plus', 'enterprise_max'))");
    expect(sql).toContain('ALTER TABLE workspaces');
    expect(sql).toContain('plan_transitions_old_plan_check');
  });

  it('adds V6.4 visibility, permission grants, session search, and governed memory/files', () => {
    const sql = readFileSync(join(migrationsDir, '025_v64_visibility_permissions_search.sql'), 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS permission_grants');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS agent_memory_store');
    expect(sql).toContain("CHECK (visibility IN ('private', 'workspace', 'public'))");
    expect(sql).toContain("ALTER TABLE nl_studio_messages\n  ADD COLUMN IF NOT EXISTS search_text TEXT NOT NULL DEFAULT ''");
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS studio_messages_search_text_idx');
    expect(sql).toContain('ALTER TABLE agent_files');
    expect(sql).toContain('ALTER TABLE private_subagents');
    expect(sql).toContain('ALTER TABLE agent_workflows');
    expect(sql).toContain('ALTER TABLE skills');
    expect(sql).toContain("CHECK (visibility IN ('public', 'private', 'workspace', 'unlisted'))");
  });
});

