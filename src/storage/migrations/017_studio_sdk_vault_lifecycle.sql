-- AgentOS Migration 017: Studio snapshots, SDK credentials, app installs,
-- plan transitions, and Vault lifecycle tables.
-- Additive only.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nl_studio_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL REFERENCES nl_studio_sessions(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  label TEXT,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES agent_apps(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'removed')),
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (app_id, agent_id)
);

CREATE TABLE IF NOT EXISTS sdk_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  public_ref TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL,
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS plan_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  old_plan TEXT NOT NULL,
  new_plan TEXT NOT NULL,
  reason TEXT,
  changed_by TEXT REFERENCES agents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vault_secret_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_id UUID NOT NULL REFERENCES vault_secrets(id) ON DELETE CASCADE,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  encrypted_value TEXT NOT NULL,
  masked_value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (secret_id, version)
);

CREATE TABLE IF NOT EXISTS vault_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('super_agentos', 'subagent', 'workflow', 'session', 'sdk_credential')),
  subject_id TEXT NOT NULL,
  can_use BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vault_id, subject_type, subject_id)
);

CREATE TABLE IF NOT EXISTS vault_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_id UUID NOT NULL REFERENCES vault_secrets(id) ON DELETE CASCADE,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('super_agentos', 'subagent', 'workflow', 'session', 'sdk_credential')),
  subject_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  UNIQUE (secret_id, subject_type, subject_id)
);

ALTER TABLE skills ADD COLUMN IF NOT EXISTS publish_state TEXT NOT NULL DEFAULT 'draft'
  CHECK (publish_state IN ('draft', 'submitted', 'published', 'rejected'));
ALTER TABLE skills ADD COLUMN IF NOT EXISTS permissions_required JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS required_secrets JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS publish_state TEXT NOT NULL DEFAULT 'draft'
  CHECK (publish_state IN ('draft', 'submitted', 'published', 'rejected'));
ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS permissions_required JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE agent_apps ADD COLUMN IF NOT EXISTS required_secrets JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS studio_snapshots_session_idx ON nl_studio_snapshots(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS app_installations_agent_idx ON app_installations(agent_id, installed_at DESC);
CREATE INDEX IF NOT EXISTS app_installations_workspace_idx ON app_installations(workspace_id, installed_at DESC);
CREATE INDEX IF NOT EXISTS sdk_credentials_workspace_idx ON sdk_credentials(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS plan_transitions_agent_idx ON plan_transitions(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vault_secret_versions_secret_idx ON vault_secret_versions(secret_id, version DESC);
CREATE INDEX IF NOT EXISTS vault_permissions_vault_idx ON vault_permissions(vault_id, subject_type, subject_id);
CREATE INDEX IF NOT EXISTS vault_assignments_secret_idx ON vault_assignments(secret_id, status);

ALTER TABLE nl_studio_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sdk_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_secret_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_assignments ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'nl_studio_snapshots',
    'app_installations',
    'sdk_credentials',
    'plan_transitions',
    'vault_secret_versions',
    'vault_permissions',
    'vault_assignments'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t
        AND policyname = 'deny_all_' || t
    ) THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (FALSE)', 'deny_all_' || t, t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
