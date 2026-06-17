-- AgentOS Migration 029: V6.6.2 execution closure.

ALTER TABLE agent_executions
  ADD COLUMN IF NOT EXISTS user_id TEXT,
  ADD COLUMN IF NOT EXISTS project_id TEXT,
  ADD COLUMN IF NOT EXISTS execution_type TEXT,
  ADD COLUMN IF NOT EXISTS logs JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS error JSONB,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

UPDATE agent_executions
SET
  user_id = COALESCE(user_id, agent_id),
  execution_type = COALESCE(
    execution_type,
    CASE source_type
      WHEN 'workflow' THEN 'WORKFLOW_EXECUTION'
      WHEN 'app' THEN 'APP_EXECUTION'
      WHEN 'skill' THEN 'SKILL_EXECUTION'
      WHEN 'subagent' THEN 'SUBAGENT_EXECUTION'
      WHEN 'mcp' THEN 'MCP_EXECUTION'
      WHEN 'file' THEN 'FILE_EXECUTION'
      WHEN 'memory' THEN 'MEMORY_EXECUTION'
      WHEN 'external_connection' THEN 'EXTERNAL_CONNECTION_EXECUTION'
      ELSE 'CHAT_EXECUTION'
    END
  ),
  status = CASE lower(status)
    WHEN 'queued' THEN 'QUEUED'
    WHEN 'running' THEN 'RUNNING'
    WHEN 'waiting_for_user' THEN 'PAUSED'
    WHEN 'paused' THEN 'PAUSED'
    WHEN 'completed' THEN 'COMPLETED'
    WHEN 'partially_completed' THEN 'FAILED'
    WHEN 'failed' THEN 'FAILED'
    WHEN 'cancelled' THEN 'CANCELLED'
    ELSE status
  END;

ALTER TABLE agent_executions
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN execution_type SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'QUEUED';

ALTER TABLE agent_executions DROP CONSTRAINT IF EXISTS agent_executions_status_check;
ALTER TABLE agent_executions DROP CONSTRAINT IF EXISTS agent_executions_source_type_check;
ALTER TABLE agent_executions DROP CONSTRAINT IF EXISTS agent_executions_execution_type_check;

ALTER TABLE agent_executions
  ADD CONSTRAINT agent_executions_status_check
    CHECK (status IN ('QUEUED', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED')),
  ADD CONSTRAINT agent_executions_source_type_check
    CHECK (source_type IN ('super_agent', 'app', 'skill', 'workflow', 'subagent', 'mcp', 'primitive', 'file', 'memory', 'external_connection', 'system')),
  ADD CONSTRAINT agent_executions_execution_type_check
    CHECK (execution_type IN (
      'CHAT_EXECUTION',
      'WORKFLOW_EXECUTION',
      'APP_EXECUTION',
      'SKILL_EXECUTION',
      'SUBAGENT_EXECUTION',
      'MCP_EXECUTION',
      'FILE_EXECUTION',
      'MEMORY_EXECUTION',
      'EXTERNAL_CONNECTION_EXECUTION'
    ));

CREATE INDEX IF NOT EXISTS agent_executions_workspace_type_status_idx
  ON agent_executions(workspace_id, execution_type, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS agent_executions_project_idx
  ON agent_executions(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS agent_executions_user_workspace_idx
  ON agent_executions(user_id, workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_execution_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES agent_executions(id) ON DELETE CASCADE,
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id TEXT,
  project_id TEXT,
  checkpoint_type TEXT NOT NULL DEFAULT 'resume'
    CHECK (checkpoint_type IN ('resume', 'pause', 'retry', 'rollback')),
  node_position JSONB NOT NULL DEFAULT '{}'::jsonb,
  variables JSONB NOT NULL DEFAULT '{}'::jsonb,
  memory_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  pending_tool_calls JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_execution_checkpoints_execution_idx
  ON agent_execution_checkpoints(execution_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_execution_checkpoints_workspace_idx
  ON agent_execution_checkpoints(workspace_id, created_at DESC);

ALTER TABLE agent_execution_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS bearer_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id TEXT,
  project_id TEXT,
  name TEXT NOT NULL,
  subject_type TEXT,
  subject_id TEXT,
  scopes JSONB NOT NULL DEFAULT '["api"]'::jsonb,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  token_hash TEXT NOT NULL,
  masked_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked')),
  last_used_at TIMESTAMPTZ,
  rotated_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bearer_tokens_owner_idx
  ON bearer_tokens(owner_agent_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS bearer_tokens_workspace_idx
  ON bearer_tokens(workspace_id, status, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS bearer_tokens_hash_unique_idx
  ON bearer_tokens(token_hash);

ALTER TABLE bearer_tokens ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS app_package_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id TEXT NOT NULL,
  workspace_id TEXT,
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  package_ref TEXT NOT NULL,
  package_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'cached'
    CHECK (status IN ('cached', 'stale', 'removed')),
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, app_id, version)
);

CREATE INDEX IF NOT EXISTS app_package_cache_owner_idx
  ON app_package_cache(owner_agent_id, status, cached_at DESC);
CREATE INDEX IF NOT EXISTS app_package_cache_workspace_idx
  ON app_package_cache(workspace_id, app_id, status);

ALTER TABLE app_package_cache ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS app_device_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id TEXT NOT NULL,
  installation_id TEXT,
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id TEXT,
  target TEXT NOT NULL
    CHECK (target IN ('android', 'ios', 'desktop', 'pwa')),
  package_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'installed'
    CHECK (status IN ('installed', 'removed')),
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_agent_id, app_id, target)
);

CREATE INDEX IF NOT EXISTS app_device_installations_owner_idx
  ON app_device_installations(owner_agent_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS app_device_installations_workspace_idx
  ON app_device_installations(workspace_id, target, status);

ALTER TABLE app_device_installations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS ffp_temp_settings (
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_agent_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS ffp_temp_settings_workspace_idx
  ON ffp_temp_settings(workspace_id, enabled, updated_at DESC);

ALTER TABLE ffp_temp_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE library_items DROP CONSTRAINT IF EXISTS library_items_source_type_check;
ALTER TABLE library_items
  ADD CONSTRAINT library_items_source_type_check
    CHECK (source_type IN (
      'installed_app',
      'installed_skill',
      'saved_workflow',
      'subagent',
      'template',
      'file',
      'published_asset',
      'forked_asset',
      'mcp_connection',
      'external_connection',
      'download',
      'recent_activity'
    ));

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS workspace_id TEXT,
  ADD COLUMN IF NOT EXISTS session_id TEXT,
  ADD COLUMN IF NOT EXISTS execution_id TEXT,
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS source_id TEXT;

CREATE INDEX IF NOT EXISTS audit_logs_workspace_created_idx
  ON audit_logs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_execution_idx
  ON audit_logs(execution_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_notifications_deeplink_idx
  ON agent_notifications(execution_id, created_at DESC);

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agent_execution_checkpoints',
    'bearer_tokens',
    'app_package_cache',
    'app_device_installations',
    'ffp_temp_settings'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t
        AND policyname = 'deny_all_' || t
    ) THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (FALSE)', 'deny_all_' || t, t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
