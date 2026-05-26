-- AgentOS Migration 011: Agentic App Store tables
-- Additive only. Safe to run after migrations 001-010.

CREATE TABLE IF NOT EXISTS agent_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL DEFAULT 'Operations',
  description TEXT NOT NULL,
  long_description TEXT,

  publisher_id TEXT NOT NULL,
  publisher_name TEXT NOT NULL,

  app_url TEXT,
  repository_url TEXT,
  device_targets JSONB NOT NULL DEFAULT '["AgentOS Cloud"]',
  manifest JSONB NOT NULL DEFAULT '{}',
  default_config JSONB NOT NULL DEFAULT '{}',

  install_count INTEGER NOT NULL DEFAULT 0,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  published BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_apps_slug ON agent_apps(slug);
CREATE INDEX IF NOT EXISTS idx_agent_apps_category ON agent_apps(category);
CREATE INDEX IF NOT EXISTS idx_agent_apps_publisher ON agent_apps(publisher_id);
CREATE INDEX IF NOT EXISTS idx_agent_apps_published ON agent_apps(published);
CREATE INDEX IF NOT EXISTS idx_agent_apps_install_count ON agent_apps(install_count DESC);
CREATE INDEX IF NOT EXISTS idx_agent_apps_created_at ON agent_apps(created_at DESC);

CREATE OR REPLACE FUNCTION increment_agent_app_installs(p_slug TEXT)
RETURNS void AS $$
  UPDATE agent_apps
  SET install_count = install_count + 1,
      updated_at = NOW()
  WHERE slug = p_slug;
$$ LANGUAGE sql;

ALTER TABLE agent_apps ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_apps'
      AND policyname = 'deny_all_agent_apps'
  ) THEN
    CREATE POLICY "deny_all_agent_apps" ON agent_apps FOR ALL USING (FALSE);
  END IF;
END $$;
