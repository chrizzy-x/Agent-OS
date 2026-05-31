-- AgentOS Migration 018: Canonical workflow document for synchronized
-- conversation/visual/code authoring.

ALTER TABLE agent_workflows
  ADD COLUMN IF NOT EXISTS canonical_doc JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS agent_workflows_workspace_idx
  ON agent_workflows(workspace_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS agent_workflows_canonical_idx
  ON agent_workflows USING GIN (canonical_doc);

NOTIFY pgrst, 'reload schema';
