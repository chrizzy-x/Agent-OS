-- AgentOS Migration 031: Marketplace Intelligence, Discovery & Publishing Layer.
-- Additive marketplace listing, ownership history, permissions, and registry expansion.

ALTER TABLE agent_apps
  ADD COLUMN IF NOT EXISTS banner_url TEXT,
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS website_url TEXT,
  ADD COLUMN IF NOT EXISTS documentation_url TEXT,
  ADD COLUMN IF NOT EXISTS release_notes TEXT,
  ADD COLUMN IF NOT EXISTS changelog JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS spotlight BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS agent_apps_spotlight_idx
  ON agent_apps(spotlight, updated_at DESC);

ALTER TABLE skills
  ADD COLUMN IF NOT EXISTS icon_url TEXT,
  ADD COLUMN IF NOT EXISTS banner_url TEXT,
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS website_url TEXT,
  ADD COLUMN IF NOT EXISTS documentation_url TEXT,
  ADD COLUMN IF NOT EXISTS release_notes TEXT,
  ADD COLUMN IF NOT EXISTS changelog JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS spotlight BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS skills_spotlight_idx
  ON skills(spotlight, updated_at DESC);

ALTER TABLE developer_profiles
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS socials JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'verified', 'trusted', 'partner')),
  ADD COLUMN IF NOT EXISTS ratings_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS average_rating NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE marketplace_ownership DROP CONSTRAINT IF EXISTS marketplace_ownership_asset_type_check;
ALTER TABLE marketplace_ownership
  ADD CONSTRAINT marketplace_ownership_asset_type_check
  CHECK (asset_type IN ('app', 'skill', 'workflow', 'subagent'));

ALTER TABLE workspace_asset_registry DROP CONSTRAINT IF EXISTS workspace_asset_registry_asset_type_check;
ALTER TABLE workspace_asset_registry
  ADD CONSTRAINT workspace_asset_registry_asset_type_check
  CHECK (asset_type IN ('app', 'skill', 'workflow', 'subagent', 'file', 'vault_asset', 'memory_asset', 'mcp_connection'));

CREATE TABLE IF NOT EXISTS marketplace_install_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id TEXT,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('app', 'skill', 'workflow', 'subagent')),
  asset_id TEXT NOT NULL,
  source_slug TEXT NOT NULL,
  version TEXT,
  device_target TEXT,
  action TEXT NOT NULL DEFAULT 'install' CHECK (action IN ('install', 'reinstall', 'update', 'remove_device', 'install_device', 'permission_update', 'permission_revoke')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS marketplace_install_history_owner_idx
  ON marketplace_install_history(owner_agent_id, asset_type, created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_install_history_workspace_idx
  ON marketplace_install_history(workspace_id, asset_type, created_at DESC);

ALTER TABLE marketplace_install_history ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS marketplace_permission_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id TEXT,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('app', 'skill')),
  asset_id TEXT NOT NULL,
  permissions_approved JSONB NOT NULL DEFAULT '[]'::jsonb,
  action TEXT NOT NULL CHECK (action IN ('approve', 'modify', 'revoke')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS marketplace_permission_history_owner_idx
  ON marketplace_permission_history(owner_agent_id, asset_type, created_at DESC);

ALTER TABLE marketplace_permission_history ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS marketplace_recommendation_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id TEXT,
  surface TEXT NOT NULL CHECK (surface IN ('appstore', 'skills', 'library', 'super_agentos')),
  reason TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('app', 'skill', 'workflow', 'subagent')),
  asset_id TEXT NOT NULL,
  score NUMERIC NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_agent_id, surface, asset_type, asset_id)
);

CREATE INDEX IF NOT EXISTS marketplace_recommendation_cache_owner_idx
  ON marketplace_recommendation_cache(owner_agent_id, surface, score DESC, updated_at DESC);

ALTER TABLE marketplace_recommendation_cache ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'marketplace_install_history',
    'marketplace_permission_history',
    'marketplace_recommendation_cache'
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
