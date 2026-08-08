-- AgentOS Migration 044: production connected intelligence listing latency.

CREATE INDEX IF NOT EXISTS intelligence_connections_owner_workspace_updated_idx
  ON intelligence_connections(owner_agent_id, workspace_id, updated_at DESC);

-- ROLLBACK:
-- DROP INDEX IF EXISTS intelligence_connections_owner_workspace_updated_idx;
