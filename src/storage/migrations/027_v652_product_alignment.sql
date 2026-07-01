-- AgentOS Migration 027: product alignment, Library, and runtime controls.

CREATE TABLE IF NOT EXISTS library_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id TEXT,
  project_id TEXT,
  source_type TEXT NOT NULL
    CHECK (source_type IN ('installed_app', 'installed_skill', 'saved_workflow', 'subagent', 'template', 'file', 'published_asset', 'forked_asset')),
  source_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'workspace', 'public')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_agent_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS library_items_owner_idx
  ON library_items(owner_agent_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS library_items_workspace_idx
  ON library_items(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS library_items_project_idx
  ON library_items(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS library_items_search_idx
  ON library_items
  USING GIN (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(source_type, '')));

ALTER TABLE library_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS agent_runtime_controls (
  agent_id TEXT PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id TEXT,
  panic_state TEXT NOT NULL DEFAULT 'healthy'
    CHECK (panic_state IN ('healthy', 'warning', 'heavy_activity', 'emergency')),
  mcp_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  vault_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  require_reauth BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_runtime_controls_workspace_idx
  ON agent_runtime_controls(workspace_id, updated_at DESC);

ALTER TABLE agent_runtime_controls ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['library_items', 'agent_runtime_controls'] LOOP
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
