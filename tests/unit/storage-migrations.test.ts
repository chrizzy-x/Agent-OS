import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const migrationsDir = join(process.cwd(), 'src', 'storage', 'migrations');

function migrationSql(name: string): string {
  return readFileSync(join(migrationsDir, name), 'utf8').replace(/\r\n/g, '\n');
}

describe('storage migrations', () => {
  it('binds db transaction parameters inside the SQL migration', () => {
    const sql = migrationSql('002_agent_db_functions.sql');

    expect(sql).toContain('CASE jsonb_array_length(v_params)');
    expect(sql).toContain('EXECUTE v_sql USING');
    expect(sql).toContain("COALESCE(v_query->'params', '[]'::JSONB)");
  });

  it('adds database-level email normalization and uniqueness enforcement', () => {
    const sql = migrationSql('007_security_hardening.sql');

    expect(sql).toContain('CREATE OR REPLACE FUNCTION normalize_agent_email');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION enforce_agent_email_uniqueness');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('CREATE TRIGGER agents_email_uniqueness');
    expect(sql).toContain('agents_metadata_email_normalized_idx');
  });

  it('adds X account management tables behind RLS deny-all policies', () => {
    const sql = migrationSql('008_x_account_management.sql');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS x_account_connections');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS x_post_drafts');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS x_publish_queue');
    expect(sql).toContain('ALTER TABLE x_account_connections ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('CREATE POLICY "deny_all_x_post_metrics"');
  });
  it('adds external agent registration and call tracking primitives', () => {
    const sql = migrationSql('009_external_agent_connector.sql');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS external_agent_registrations');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_ext_reg_agent_id');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION increment_ext_agent_calls');
    expect(sql).toContain('ALTER TABLE external_agent_registrations ENABLE ROW LEVEL SECURITY');
  });

  it('adds durable Studio workflow result tracking', () => {
    const sql = migrationSql('014_studio_recurring_workflows.sql');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS agent_workflows');
    expect(sql).toContain('ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS workflow_id');
    expect(sql).toContain('last_result JSONB');
    expect(sql).toContain('CREATE POLICY "deny_all_agent_workflows"');
  });

  it('adds database-level agent name uniqueness enforcement', () => {
    const sql = migrationSql('015_unique_agent_names.sql');

    expect(sql).toContain('CREATE OR REPLACE FUNCTION normalize_agent_name');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION enforce_agent_name_uniqueness');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION enforce_external_agent_name_uniqueness');
    expect(sql).toContain('CREATE TRIGGER agents_name_uniqueness');
    expect(sql).toContain('CREATE TRIGGER external_agent_registrations_name_uniqueness');
    expect(sql).toContain('agents_name_normalized_unique_idx');
  });

  it('adds Studio-first plans, Vault, sessions, and private subagents', () => {
    const sql = migrationSql('016_agentos_studio_vault_plans.sql');

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
    const sql = migrationSql('017_studio_sdk_vault_lifecycle.sql');

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
    const sql = migrationSql('018_workflow_canonical_document.sql');

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS canonical_doc JSONB NOT NULL DEFAULT');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS agent_workflows_workspace_idx');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS agent_workflows_canonical_idx');
  });

  it('formalizes kernel registry and visibility-aware app catalog fields', () => {
    const sql = migrationSql('019_kernel_registry_and_app_visibility.sql');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS kernel_registry');
    expect(sql).toContain('UNIQUE (agent_id, product)');
    expect(sql).toContain("ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'internal'");
    expect(sql).toContain("ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'");
    expect(sql).toContain('ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS workspace_id TEXT');
    expect(sql).toContain('ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS screenshots JSONB NOT NULL DEFAULT');
    expect(sql).toContain('ALTER TABLE kernel_registry ENABLE ROW LEVEL SECURITY');
  });

  it('adds sdk heartbeat health and app runtime installation metadata', () => {
    const sql = migrationSql('020_sdk_health_app_runtime.sql');

    expect(sql).toContain('ALTER TABLE kernel_registry ADD COLUMN IF NOT EXISTS health_status');
    expect(sql).toContain('ALTER TABLE kernel_registry ADD COLUMN IF NOT EXISTS endpoint_status');
    expect(sql).toContain('ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS heartbeat_count');
    expect(sql).toContain('ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS open_count');
    expect(sql).toContain('ALTER TABLE app_installations ADD COLUMN IF NOT EXISTS favorite');
    expect(sql).toContain("ALTER TABLE app_installations ADD COLUMN IF NOT EXISTS permissions_approved JSONB NOT NULL DEFAULT '[]'::jsonb");
  });

  it('adds app version history, session branching lineage, and Vault runtime subjects', () => {
    const sql = migrationSql('021_app_versions_session_branching.sql');

    expect(sql).toContain('ALTER TABLE app_installations ADD COLUMN IF NOT EXISTS installed_version TEXT');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS agent_app_versions');
    expect(sql).toContain('ALTER TABLE nl_studio_sessions ADD COLUMN IF NOT EXISTS parent_session_id');
    expect(sql).toContain('ALTER TABLE nl_studio_sessions ADD COLUMN IF NOT EXISTS parent_snapshot_id');
    expect(sql).toContain("'app', 'skill'");
    expect(sql).toContain('ALTER TABLE agent_app_versions ENABLE ROW LEVEL SECURITY');
  });

  it('adds durable Vault runtime grants with deny-all RLS', () => {
    const sql = migrationSql('022_vault_runtime_grants.sql');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS vault_runtime_grants');
    expect(sql).toContain("CHECK (status IN ('active', 'consumed', 'cleaned', 'expired'))");
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS vault_runtime_grants_owner_idx');
    expect(sql).toContain('ALTER TABLE vault_runtime_grants ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('deny_all_vault_runtime_grants');
  });

  it('adds connected intelligence persistence with rollback guardrails', () => {
    const sql = migrationSql('035_intelligence_runtime.sql');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS intelligence_connections');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS intelligence_defaults');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS studio_session_intelligence');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS intelligence_invocations');
    expect(sql).toContain('workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE');
    expect(sql).toContain('workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL');
    expect(sql).toContain('execution_id UUID REFERENCES agent_executions(id) ON DELETE SET NULL');
    expect(sql).toContain('consensus_configuration_id UUID');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS consensus_configuration_id UUID');
    expect(sql).toContain("vendor TEXT NOT NULL CHECK (vendor IN ('openai', 'anthropic', 'gemini'))");
    expect(sql).toContain('vault_secret_id UUID NOT NULL REFERENCES vault_secrets(id) ON DELETE RESTRICT');
    expect(sql).toContain("CHECK (status IN ('pending_validation', 'active', 'invalid', 'disabled', 'revoked'))");
    expect(sql).toContain('ALTER TABLE nl_studio_sessions');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS intelligence_selection JSONB NOT NULL DEFAULT');
    expect(sql).toContain('ALTER TABLE intelligence_connections ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain("policyname = 'deny_all_' || t");
    expect(sql).toContain('-- ROLLBACK:');
    expect(sql).toContain('DROP TABLE IF EXISTS intelligence_invocations');
    expect(sql).toContain('DROP TABLE IF EXISTS intelligence_connections');
  });

  it('adds durable multi-intelligence worker run persistence', () => {
    const sql = migrationSql('036_intelligence_worker_runs.sql');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS intelligence_worker_runs');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS intelligence_worker_outputs');
    expect(sql).toContain('workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE');
    expect(sql).toContain('execution_id UUID REFERENCES agent_executions(id) ON DELETE SET NULL');
    expect(sql).toContain("CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled'))");
    expect(sql).toContain('UNIQUE (run_id, worker_key)');
    expect(sql).toContain('invocation_id UUID REFERENCES intelligence_invocations');
    expect(sql).toContain('ALTER TABLE intelligence_worker_runs ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE intelligence_worker_outputs ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain("policyname = 'deny_all_' || t");
    expect(sql).toContain('-- ROLLBACK:');
    expect(sql).toContain('DROP TABLE IF EXISTS intelligence_worker_outputs');
    expect(sql).toContain('DROP TABLE IF EXISTS intelligence_worker_runs');
  });

  it('adds Standard Consensus records without activating FFP', () => {
    const sql = migrationSql('037_standard_consensus.sql');
    const runtimeSql = migrationSql('035_intelligence_runtime.sql');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS intelligence_consensus_configurations');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS intelligence_consensus_records');
    expect(sql).toContain('workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE');
    expect(sql).toContain('execution_id UUID REFERENCES agent_executions(id) ON DELETE SET NULL');
    expect(sql).toContain('ALTER COLUMN consensus_configuration_id TYPE TEXT');
    expect(runtimeSql).toContain('consensus_configuration_id UUID');
    expect(sql).toContain("CHECK (strategy IN ('standard'))");
    expect(sql).toContain('preserve_dissent BOOLEAN NOT NULL DEFAULT TRUE');
    expect(sql).toContain('worker_run_id UUID REFERENCES intelligence_worker_runs');
    expect(sql).toContain('consensus_hash TEXT');
    expect(sql).toContain('dissent JSONB NOT NULL DEFAULT');
    expect(sql).toContain('ALTER TABLE intelligence_consensus_configurations ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE intelligence_consensus_records ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain("policyname = 'deny_all_' || t");
    expect(sql).not.toContain('FFP Enabled');
    expect(sql).toContain('-- ROLLBACK:');
    expect(sql).toContain('DROP TABLE IF EXISTS intelligence_consensus_records');
    expect(sql).toContain('DROP TABLE IF EXISTS intelligence_consensus_configurations');
  });

  it('catches memory runtime schema up for native Super AgentOS operations', () => {
    const sql = migrationSql('038_memory_runtime_catchup.sql');

    expect(sql).toContain('ALTER TABLE agent_memory_store');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE');
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS namespace_type TEXT NOT NULL DEFAULT 'agent'");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private'");
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS agent_memory_store_namespace_key_idx');
    expect(sql).toContain('ALTER TABLE agent_workflows');
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private'");
    expect(sql).toContain("CHECK (visibility IN ('private', 'workspace', 'public'))");
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });

  it('adds durable Studio approval token storage for serverless confirmations', () => {
    const sql = migrationSql('039_studio_confirm_tokens.sql');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS studio_confirm_tokens');
    expect(sql).toContain('key_hash TEXT PRIMARY KEY');
    expect(sql).toContain('expires_at TIMESTAMPTZ NOT NULL');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS studio_confirm_tokens_expires_at_idx');
    expect(sql).toContain('ALTER TABLE studio_confirm_tokens ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('CREATE POLICY "deny_all_studio_confirm_tokens"');
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
    expect(sql).toContain('-- ROLLBACK:');
  });

  it('converts stale UUID workflow references to text for prefixed Primeflow ids', () => {
    const sql = migrationSql('040_workflow_reference_text_catchup.sql');

    expect(sql).toContain('ALTER COLUMN workflow_id TYPE TEXT USING workflow_id::text');
    expect(sql).toContain('ALTER COLUMN linked_workflow_id TYPE TEXT USING linked_workflow_id::text');
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
    expect(sql).toContain('-- ROLLBACK:');
  });

  it('formalizes FFP execution logs and removes legacy persisted plan identifiers', () => {
    const sql = migrationSql('023_ffp_audit_and_plan_cleanup.sql');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS ffp_chain_executions');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS fallback_used');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS route_decision JSONB');
    expect(sql).toContain("UPDATE agents\nSET tier = CASE tier");
    expect(sql).toContain("CHECK (tier IN ('retail_free', 'retail_pro', 'enterprise_plus', 'enterprise_max'))");
    expect(sql).toContain('ALTER TABLE workspaces');
    expect(sql).toContain('plan_transitions_old_plan_check');
  });

  it('adds V6.4 visibility, permission grants, session search, and governed memory/files', () => {
    const sql = migrationSql('025_v64_visibility_permissions_search.sql');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS permission_grants');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS agent_memory_store');
    expect(sql).toContain("CHECK (visibility IN ('private', 'workspace', 'public'))");
    expect(sql).toContain("ALTER TABLE nl_studio_messages\n  ADD COLUMN IF NOT EXISTS search_text TEXT NOT NULL DEFAULT ''");
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS linked_workflow_id UUID REFERENCES agent_workflows');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS studio_messages_search_text_idx');
    expect(sql).toContain('ALTER TABLE agent_files');
    expect(sql).toContain('ALTER TABLE private_subagents');
    expect(sql).toContain('ALTER TABLE agent_workflows');
    expect(sql).toContain('ALTER TABLE skills');
    expect(sql).toContain("CHECK (visibility IN ('public', 'private', 'workspace', 'unlisted'))");
  });

  it('adds Library and runtime control primitives', () => {
    const sql = migrationSql('027_v652_product_alignment.sql');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS library_items');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS agent_runtime_controls');
    expect(sql).toContain("CHECK (source_type IN ('installed_app', 'installed_skill', 'saved_workflow', 'subagent', 'template', 'file', 'published_asset', 'forked_asset'))");
    expect(sql).toContain("CHECK (panic_state IN ('healthy', 'warning', 'heavy_activity', 'emergency'))");
    expect(sql).toContain('ALTER TABLE library_items ENABLE ROW LEVEL SECURITY');
  });

  it('adds V6.6.2 action audit metadata and recovery fields', () => {
    const sql = migrationSql('028_v661_production_closure.sql');

    expect(sql).toContain('ALTER TABLE audit_logs');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS execution_id TEXT');
    expect(sql).toContain('ALTER TABLE agent_executions');
    expect(sql).toContain("CHECK (recovery_action IS NULL OR recovery_action IN ('resume', 'retry', 'rollback', 'inspect', 'cancel'))");
    expect(sql).toContain('ALTER TABLE agent_runtime_controls');
    expect(sql).toContain('ALTER TABLE library_items');
  });

  it('adds V6.6.2 execution closure primitives', () => {
    const sql = migrationSql('029_v662_execution_closure.sql');

    expect(sql).toContain("CHECK (status IN ('QUEUED', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED'))");
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS agent_execution_checkpoints');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS bearer_tokens');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS app_package_cache');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS app_device_installations');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS ffp_temp_settings');
    expect(sql).toContain("'EXTERNAL_CONNECTION_EXECUTION'");
    expect(sql).toContain("'mcp_connection'");
    expect(sql).toContain("'recent_activity'");
  });
});

