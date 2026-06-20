-- AgentOS Migration 030: v6.6.4 Marketplace & Capability Layer.
-- Additive only. Keeps App Store and Skill Store assets first-class workspace primitives.

ALTER TABLE agent_apps
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS developer_handle TEXT,
  ADD COLUMN IF NOT EXISTS keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS platforms JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rating NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS download_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_user_count INTEGER NOT NULL DEFAULT 0;

UPDATE agent_apps
SET developer_handle = lower(regexp_replace(coalesce(publisher_name, slug), '[^a-zA-Z0-9]+', '-', 'g'))
WHERE developer_handle IS NULL OR developer_handle = '';

CREATE INDEX IF NOT EXISTS agent_apps_developer_handle_idx
  ON agent_apps(developer_handle);
CREATE INDEX IF NOT EXISTS agent_apps_rating_idx
  ON agent_apps(rating DESC, review_count DESC);
CREATE INDEX IF NOT EXISTS agent_apps_recent_update_idx
  ON agent_apps(updated_at DESC);

CREATE TABLE IF NOT EXISTS app_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES agent_apps(id) ON DELETE CASCADE,
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_title TEXT,
  review_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (app_id, owner_agent_id)
);

CREATE INDEX IF NOT EXISTS app_reviews_app_idx
  ON app_reviews(app_id, created_at DESC);

ALTER TABLE app_reviews ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS marketplace_ownership (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id TEXT,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('app', 'skill')),
  asset_id TEXT NOT NULL,
  source_slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'owned' CHECK (status IN ('owned', 'revoked')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_agent_id, asset_type, asset_id)
);

CREATE INDEX IF NOT EXISTS marketplace_ownership_owner_idx
  ON marketplace_ownership(owner_agent_id, asset_type, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_ownership_workspace_idx
  ON marketplace_ownership(workspace_id, asset_type, status, updated_at DESC);

ALTER TABLE marketplace_ownership ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS workspace_asset_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT,
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('app', 'skill', 'workflow', 'subagent', 'vault_asset', 'memory_asset', 'mcp_connection')),
  asset_id TEXT NOT NULL,
  source_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  href TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'removed')),
  search_text TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_agent_id, asset_type, asset_id)
);

CREATE INDEX IF NOT EXISTS workspace_asset_registry_owner_idx
  ON workspace_asset_registry(owner_agent_id, asset_type, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS workspace_asset_registry_workspace_idx
  ON workspace_asset_registry(workspace_id, asset_type, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS workspace_asset_registry_search_idx
  ON workspace_asset_registry
  USING GIN (to_tsvector('simple', search_text));

ALTER TABLE workspace_asset_registry ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS developer_profiles (
  handle TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  bio TEXT,
  website TEXT,
  followers_count INTEGER NOT NULL DEFAULT 0,
  total_downloads INTEGER NOT NULL DEFAULT 0,
  total_active_users INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS developer_profiles_agent_idx
  ON developer_profiles(agent_id);

ALTER TABLE developer_profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS developer_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_handle TEXT NOT NULL REFERENCES developer_profiles(handle) ON DELETE CASCADE,
  follower_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (developer_handle, follower_agent_id)
);

ALTER TABLE developer_follows ENABLE ROW LEVEL SECURITY;

ALTER TABLE skills
  ADD COLUMN IF NOT EXISTS permissions_required JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS required_secrets JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS developer_handle TEXT,
  ADD COLUMN IF NOT EXISTS required_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS optional_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS compatibility JSONB NOT NULL DEFAULT '["Super AgentOS","Workflows","Subagents","Apps"]'::jsonb,
  ADD COLUMN IF NOT EXISTS examples JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS inputs JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS outputs JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS dependencies JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE skills
SET developer_handle = lower(regexp_replace(coalesce(author_name, slug), '[^a-zA-Z0-9]+', '-', 'g'))
WHERE developer_handle IS NULL OR developer_handle = '';

CREATE INDEX IF NOT EXISTS skills_developer_handle_idx
  ON skills(developer_handle);
CREATE INDEX IF NOT EXISTS skills_recent_update_idx
  ON skills(updated_at DESC);

ALTER TABLE skill_installations
  ADD COLUMN IF NOT EXISTS workspace_id TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled', 'removed')),
  ADD COLUMN IF NOT EXISTS permissions_approved JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS dependency_install BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS skill_installations_agent_status_idx
  ON skill_installations(agent_id, status, installed_at DESC);
CREATE INDEX IF NOT EXISTS skill_installations_workspace_status_idx
  ON skill_installations(workspace_id, status, installed_at DESC);

CREATE TABLE IF NOT EXISTS skill_version_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  release_notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (skill_id, version)
);

CREATE INDEX IF NOT EXISTS skill_version_history_skill_idx
  ON skill_version_history(skill_id, created_at DESC);

ALTER TABLE skill_version_history ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'app_reviews',
    'marketplace_ownership',
    'workspace_asset_registry',
    'developer_profiles',
    'developer_follows',
    'skill_version_history'
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
