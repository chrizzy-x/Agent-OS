-- AgentOS Migration 020: SDK heartbeat health, app runtime permissions,
-- and installation lifecycle metadata.
-- Additive only.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE kernel_registry ADD COLUMN IF NOT EXISTS health_status TEXT NOT NULL DEFAULT 'online'
  CHECK (health_status IN ('online', 'offline', 'degraded', 'disabled', 'unknown'));
ALTER TABLE kernel_registry ADD COLUMN IF NOT EXISTS endpoint_status TEXT NOT NULL DEFAULT 'healthy'
  CHECK (endpoint_status IN ('healthy', 'offline', 'degraded', 'disabled', 'unknown'));
ALTER TABLE kernel_registry ADD COLUMN IF NOT EXISTS last_command_at TIMESTAMPTZ;
ALTER TABLE kernel_registry ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE kernel_registry ADD COLUMN IF NOT EXISTS version TEXT NOT NULL DEFAULT '1.0.0';
ALTER TABLE kernel_registry ADD COLUMN IF NOT EXISTS disabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS health_status TEXT NOT NULL DEFAULT 'unknown'
  CHECK (health_status IN ('online', 'offline', 'degraded', 'disabled', 'unknown'));
ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS endpoint_status TEXT NOT NULL DEFAULT 'unknown'
  CHECK (endpoint_status IN ('healthy', 'offline', 'degraded', 'disabled', 'unknown'));
ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS last_command_at TIMESTAMPTZ;
ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS version TEXT NOT NULL DEFAULT '1.0.0';
ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS disabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS heartbeat_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS open_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS web_open_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS android_download_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS ios_download_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE app_installations ADD COLUMN IF NOT EXISTS favorite BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE app_installations ADD COLUMN IF NOT EXISTS permissions_approved JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE app_installations ADD COLUMN IF NOT EXISTS open_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE app_installations ADD COLUMN IF NOT EXISTS last_opened_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_kernel_registry_health_status ON kernel_registry(health_status, last_heartbeat_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_apps_health_status ON agent_apps(health_status, source, visibility);
CREATE INDEX IF NOT EXISTS idx_app_installations_favorite ON app_installations(agent_id, favorite, updated_at DESC);

NOTIFY pgrst, 'reload schema';
