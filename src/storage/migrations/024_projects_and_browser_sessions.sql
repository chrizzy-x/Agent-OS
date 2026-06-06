-- AgentOS Migration 024: first-class projects and refresh-session browser auth.
-- Additive and backfill-safe.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, slug)
);

INSERT INTO projects (
  id,
  workspace_id,
  owner_agent_id,
  name,
  slug,
  description,
  status,
  metadata,
  created_at,
  updated_at
)
SELECT
  CONCAT('project_', regexp_replace(workspaces.id, '[^a-zA-Z0-9_-]', '_', 'g'), '_default'),
  workspaces.id,
  workspaces.owner_id,
  'Default Project',
  'default',
  'Default project for this workspace',
  'active',
  '{"system":true}'::jsonb,
  NOW(),
  NOW()
FROM workspaces
ON CONFLICT (id) DO NOTHING;

ALTER TABLE nl_studio_sessions
  ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;

ALTER TABLE agent_workflows
  ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;

ALTER TABLE private_subagents
  ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;

UPDATE nl_studio_sessions sessions
SET project_id = projects.id
FROM projects
WHERE sessions.project_id IS NULL
  AND sessions.workspace_id = projects.workspace_id
  AND projects.slug = 'default';

UPDATE agent_workflows workflows
SET project_id = projects.id
FROM projects
WHERE workflows.project_id IS NULL
  AND workflows.workspace_id = projects.workspace_id
  AND projects.slug = 'default';

UPDATE private_subagents subagents
SET project_id = projects.id
FROM projects
WHERE subagents.project_id IS NULL
  AND subagents.workspace_id = projects.workspace_id
  AND projects.slug = 'default';

CREATE INDEX IF NOT EXISTS projects_workspace_idx
  ON projects(workspace_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS projects_owner_idx
  ON projects(owner_agent_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS studio_sessions_project_idx
  ON nl_studio_sessions(project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS workflows_project_idx
  ON agent_workflows(project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS subagents_project_idx
  ON private_subagents(project_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS trusted_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'Trusted device',
  user_agent TEXT,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  UNIQUE (agent_id, fingerprint)
);

CREATE TABLE IF NOT EXISTS auth_refresh_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  device_id UUID REFERENCES trusted_devices(id) ON DELETE SET NULL,
  session_selector TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL,
  user_agent TEXT,
  device_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  replaced_by_id UUID REFERENCES auth_refresh_sessions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS session_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  session_id UUID REFERENCES auth_refresh_sessions(id) ON DELETE SET NULL,
  device_id UUID REFERENCES trusted_devices(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trusted_devices_agent_idx
  ON trusted_devices(agent_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS auth_refresh_sessions_agent_idx
  ON auth_refresh_sessions(agent_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS auth_refresh_sessions_selector_idx
  ON auth_refresh_sessions(session_selector);

CREATE INDEX IF NOT EXISTS session_audit_logs_agent_idx
  ON session_audit_logs(agent_id, created_at DESC);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE trusted_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_refresh_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['projects', 'trusted_devices', 'auth_refresh_sessions', 'session_audit_logs'] LOOP
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
