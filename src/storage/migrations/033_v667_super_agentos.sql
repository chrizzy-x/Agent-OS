-- AgentOS Migration 033: V6.6.7 Super AgentOS context, capability, task, and approval layer.
-- Additive only.

CREATE TABLE IF NOT EXISTS capability_registry (
  id TEXT PRIMARY KEY,
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('system', 'app', 'skill', 'workflow', 'subagent', 'mcp', 'project', 'library')),
  source_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'needs_config', 'disabled', 'error')),
  status_reason TEXT,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_secrets JSONB NOT NULL DEFAULT '[]'::jsonb,
  input_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_agent_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS capability_registry_owner_idx
  ON capability_registry(owner_agent_id, status, source_type, updated_at DESC);
CREATE INDEX IF NOT EXISTS capability_registry_workspace_idx
  ON capability_registry(workspace_id, status, source_type, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  session_id TEXT,
  workspace_id TEXT,
  project_id TEXT,
  title TEXT NOT NULL,
  original_prompt TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'planning', 'awaiting_confirmation', 'running', 'paused', 'completed', 'failed', 'cancelled', 'needs_configuration')),
  plan JSONB NOT NULL DEFAULT '[]'::jsonb,
  capability_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  confirmation_status TEXT NOT NULL DEFAULT 'not_required'
    CHECK (confirmation_status IN ('not_required', 'pending', 'approved', 'rejected')),
  progress NUMERIC NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  error_message TEXT,
  result_summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS agent_tasks_user_status_idx
  ON agent_tasks(user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS agent_tasks_session_idx
  ON agent_tasks(session_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS agent_tasks_workspace_idx
  ON agent_tasks(workspace_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_task_steps (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  capability_id TEXT,
  action_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled', 'needs_configuration')),
  input_summary TEXT,
  output_summary TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_task_steps_task_idx
  ON agent_task_steps(task_id, created_at ASC);
CREATE INDEX IF NOT EXISTS agent_task_steps_user_idx
  ON agent_task_steps(user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_confirmations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES agent_tasks(id) ON DELETE SET NULL,
  capability_id TEXT,
  action_id TEXT,
  action_name TEXT NOT NULL,
  risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  data_summary TEXT NOT NULL DEFAULT '',
  secret_scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  expected_result TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  approval_count INTEGER NOT NULL DEFAULT 0,
  required_approvals INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS agent_confirmations_user_status_idx
  ON agent_confirmations(user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS agent_confirmations_task_idx
  ON agent_confirmations(task_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS super_agent_audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id TEXT,
  session_id TEXT,
  task_id TEXT,
  action TEXT NOT NULL,
  capability_id TEXT,
  risk_level TEXT,
  permission_used TEXT,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS super_agent_audit_logs_user_idx
  ON super_agent_audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS super_agent_audit_logs_task_idx
  ON super_agent_audit_logs(task_id, created_at DESC);

ALTER TABLE agent_memory_store
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS source_id TEXT,
  ADD COLUMN IF NOT EXISTS summary TEXT;

ALTER TABLE agent_notifications
  ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS action_url TEXT;

ALTER TABLE agent_apps
  ADD COLUMN IF NOT EXISTS sdk_manifest JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE capability_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_task_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE super_agent_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'capability_registry',
    'agent_tasks',
    'agent_task_steps',
    'agent_confirmations',
    'super_agent_audit_logs'
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
