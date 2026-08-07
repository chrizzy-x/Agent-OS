-- AgentOS Migration 038: production Studio execution list latency.

CREATE INDEX IF NOT EXISTS agent_executions_agent_workspace_updated_idx
  ON agent_executions(agent_id, workspace_id, updated_at DESC);
