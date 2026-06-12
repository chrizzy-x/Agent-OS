-- AgentOS Migration 026: v6.5.1 unified execution, recovery, notifications, and session lifecycle.

ALTER TABLE nl_studio_sessions
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS nl_studio_sessions_lifecycle_idx
  ON nl_studio_sessions(owner_agent_id, deleted_at, pinned_at DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  session_id UUID REFERENCES nl_studio_sessions(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL DEFAULT 'super_agent'
    CHECK (source_type IN ('super_agent', 'app', 'skill', 'workflow', 'mcp', 'primitive', 'file', 'memory', 'system')),
  source_id TEXT,
  workflow_id UUID REFERENCES agent_workflows(id) ON DELETE SET NULL,
  app_id TEXT,
  skill_id TEXT,
  mcp_server TEXT,
  mcp_tool TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'waiting_for_user', 'paused', 'completed', 'partially_completed', 'failed', 'cancelled')),
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB,
  failure JSONB,
  rollback JSONB,
  model TEXT,
  token_prompt INTEGER NOT NULL DEFAULT 0,
  token_completion INTEGER NOT NULL DEFAULT 0,
  token_total INTEGER NOT NULL DEFAULT 0,
  estimated_cost NUMERIC(12, 6) NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_executions_agent_status_idx
  ON agent_executions(agent_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS agent_executions_session_idx
  ON agent_executions(session_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS agent_executions_source_idx
  ON agent_executions(source_type, source_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS agent_executions_workflow_idx
  ON agent_executions(workflow_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS agent_executions_search_idx
  ON agent_executions
  USING GIN (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(source_type, '') || ' ' || coalesce(status, '')));

ALTER TABLE agent_executions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_executions'
      AND policyname = 'deny_all_agent_executions'
  ) THEN
    CREATE POLICY "deny_all_agent_executions"
      ON agent_executions
      FOR ALL
      USING (FALSE);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS agent_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES agent_executions(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'info'
    CHECK (level IN ('debug', 'info', 'warning', 'error')),
  message TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_execution_logs_execution_idx
  ON agent_execution_logs(execution_id, created_at ASC);
CREATE INDEX IF NOT EXISTS agent_execution_logs_agent_idx
  ON agent_execution_logs(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_execution_logs_search_idx
  ON agent_execution_logs
  USING GIN (to_tsvector('simple', message));

ALTER TABLE agent_execution_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_execution_logs'
      AND policyname = 'deny_all_agent_execution_logs'
  ) THEN
    CREATE POLICY "deny_all_agent_execution_logs"
      ON agent_execution_logs
      FOR ALL
      USING (FALSE);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS agent_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  session_id UUID REFERENCES nl_studio_sessions(id) ON DELETE SET NULL,
  execution_id UUID REFERENCES agent_executions(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'system',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread'
    CHECK (status IN ('unread', 'read', 'archived')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS agent_notifications_agent_status_idx
  ON agent_notifications(agent_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_notifications_execution_idx
  ON agent_notifications(execution_id, created_at DESC);

ALTER TABLE agent_notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_notifications'
      AND policyname = 'deny_all_agent_notifications'
  ) THEN
    CREATE POLICY "deny_all_agent_notifications"
      ON agent_notifications
      FOR ALL
      USING (FALSE);
  END IF;
END $$;
