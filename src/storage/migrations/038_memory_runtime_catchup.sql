-- AgentOS Migration 038: Memory runtime catch-up for native Super AgentOS operations.
-- Additive only. Keeps Redis optional by ensuring durable AgentOS memory rows work in production.

ALTER TABLE agent_memory_store
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS content TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS namespace_type TEXT NOT NULL DEFAULT 'agent',
  ADD COLUMN IF NOT EXISTS namespace_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS source_id TEXT,
  ADD COLUMN IF NOT EXISTS summary TEXT;

UPDATE agent_memory_store
SET namespace_id = agent_id
WHERE namespace_id = '';

ALTER TABLE agent_memory_store DROP CONSTRAINT IF EXISTS agent_memory_store_namespace_type_check;
ALTER TABLE agent_memory_store
  ADD CONSTRAINT agent_memory_store_namespace_type_check
  CHECK (namespace_type IN ('user', 'agent', 'subagent', 'workspace', 'workflow', 'app', 'skill'));

ALTER TABLE agent_memory_store DROP CONSTRAINT IF EXISTS agent_memory_store_visibility_check;
ALTER TABLE agent_memory_store
  ADD CONSTRAINT agent_memory_store_visibility_check
  CHECK (visibility IN ('private', 'workspace', 'public'));

CREATE UNIQUE INDEX IF NOT EXISTS agent_memory_store_namespace_key_idx
  ON agent_memory_store(agent_id, key, namespace_type, namespace_id);
CREATE INDEX IF NOT EXISTS agent_memory_store_workspace_idx
  ON agent_memory_store(workspace_id, visibility, updated_at DESC);
CREATE INDEX IF NOT EXISTS agent_memory_store_namespace_idx
  ON agent_memory_store(namespace_type, namespace_id, updated_at DESC);

ALTER TABLE agent_workflows
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private';

ALTER TABLE agent_workflows DROP CONSTRAINT IF EXISTS agent_workflows_visibility_check;
ALTER TABLE agent_workflows
  ADD CONSTRAINT agent_workflows_visibility_check
  CHECK (visibility IN ('private', 'workspace', 'public'));

CREATE INDEX IF NOT EXISTS agent_workflows_visibility_idx
  ON agent_workflows(agent_id, visibility, updated_at DESC);

NOTIFY pgrst, 'reload schema';
