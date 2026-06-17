-- AgentOS Migration 028: V6.6.2 production closure metadata and recovery hardening.

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
CREATE INDEX IF NOT EXISTS audit_logs_source_idx
  ON audit_logs(source_type, source_id, created_at DESC);

ALTER TABLE agent_executions
  ADD COLUMN IF NOT EXISTS action_type TEXT,
  ADD COLUMN IF NOT EXISTS action_source TEXT,
  ADD COLUMN IF NOT EXISTS notification_id UUID REFERENCES agent_notifications(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deep_link TEXT,
  ADD COLUMN IF NOT EXISTS recovery_action TEXT
    CHECK (recovery_action IS NULL OR recovery_action IN ('resume', 'retry', 'rollback', 'inspect', 'cancel')),
  ADD COLUMN IF NOT EXISTS recovery_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_detail JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS agent_executions_action_idx
  ON agent_executions(agent_id, action_type, updated_at DESC);
CREATE INDEX IF NOT EXISTS agent_executions_recovery_idx
  ON agent_executions(agent_id, recovery_action, recovery_requested_at DESC);

ALTER TABLE agent_runtime_controls
  ADD COLUMN IF NOT EXISTS last_action TEXT
    CHECK (last_action IS NULL OR last_action IN ('pause', 'stop_all', 'lockdown', 'resume', 'retry', 'rollback', 'inspect', 'cancel')),
  ADD COLUMN IF NOT EXISTS last_action_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_execution_id TEXT;

CREATE INDEX IF NOT EXISTS agent_runtime_controls_action_idx
  ON agent_runtime_controls(agent_id, last_action_at DESC);

ALTER TABLE library_items
  ADD COLUMN IF NOT EXISTS last_opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS action_source TEXT,
  ADD COLUMN IF NOT EXISTS execution_id TEXT;

CREATE INDEX IF NOT EXISTS library_items_opened_idx
  ON library_items(owner_agent_id, last_opened_at DESC);
CREATE INDEX IF NOT EXISTS library_items_execution_idx
  ON library_items(execution_id);

NOTIFY pgrst, 'reload schema';
