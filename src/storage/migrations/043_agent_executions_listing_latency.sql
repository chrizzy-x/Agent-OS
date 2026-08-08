-- AgentOS Migration 043: production Studio execution listing latency.

CREATE INDEX IF NOT EXISTS agent_executions_agent_updated_idx
  ON agent_executions(agent_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS agent_executions_agent_session_updated_idx
  ON agent_executions(agent_id, session_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS agent_executions_agent_workspace_session_updated_idx
  ON agent_executions(agent_id, workspace_id, session_id, updated_at DESC);

-- ROLLBACK:
-- DROP INDEX IF EXISTS agent_executions_agent_workspace_session_updated_idx;
-- DROP INDEX IF EXISTS agent_executions_agent_session_updated_idx;
-- DROP INDEX IF EXISTS agent_executions_agent_updated_idx;
