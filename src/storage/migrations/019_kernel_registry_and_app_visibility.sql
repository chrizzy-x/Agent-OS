-- AgentOS Migration 019: Kernel registry formalization and App Store visibility/source metadata.
-- Additive only.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS kernel_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  product TEXT NOT NULL,
  command_topic TEXT NOT NULL,
  status_topic TEXT NOT NULL,
  available_commands JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'online',
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_heartbeat_at TIMESTAMPTZ,
  last_status_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (agent_id, product)
);

ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'internal'
  CHECK (source IN ('internal', 'external_sdk'));
ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public', 'private', 'unlisted'));
ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS kernel_product TEXT;
ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS kernel_command_topic TEXT;
ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS kernel_status_topic TEXT;
ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ;
ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS runtime_type TEXT;
ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS screenshots JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE agent_apps
SET visibility = CASE
  WHEN visibility IS NOT NULL THEN visibility
  WHEN published = FALSE THEN 'private'
  ELSE 'public'
END;

UPDATE agent_apps
SET source = COALESCE(source, 'internal');

UPDATE agent_apps
SET runtime_type = COALESCE(runtime_type, manifest->>'runtime', 'agentos-app');

UPDATE agent_apps
SET published = CASE WHEN visibility = 'public' THEN TRUE ELSE FALSE END;

CREATE INDEX IF NOT EXISTS idx_kernel_registry_agent_product ON kernel_registry(agent_id, product);
CREATE INDEX IF NOT EXISTS idx_kernel_registry_workspace_registered ON kernel_registry(workspace_id, registered_at DESC);
CREATE INDEX IF NOT EXISTS idx_kernel_registry_last_heartbeat ON kernel_registry(last_heartbeat_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_apps_visibility ON agent_apps(visibility);
CREATE INDEX IF NOT EXISTS idx_agent_apps_source ON agent_apps(source);
CREATE INDEX IF NOT EXISTS idx_agent_apps_workspace_visibility ON agent_apps(workspace_id, visibility);
CREATE INDEX IF NOT EXISTS idx_agent_apps_kernel_product ON agent_apps(kernel_product);

ALTER TABLE kernel_registry ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'kernel_registry'
      AND policyname = 'deny_all_kernel_registry'
  ) THEN
    CREATE POLICY "deny_all_kernel_registry" ON kernel_registry FOR ALL USING (FALSE);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
