-- AgentOS Migration 021: App version history, install version tracking,
-- session branching lineage, and Vault runtime subject expansion.
-- Additive only.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE app_installations ADD COLUMN IF NOT EXISTS installed_version TEXT;

CREATE TABLE IF NOT EXISTS agent_app_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES agent_apps(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  change_summary TEXT,
  manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (app_id, version)
);

ALTER TABLE nl_studio_sessions ADD COLUMN IF NOT EXISTS parent_session_id TEXT REFERENCES nl_studio_sessions(id) ON DELETE SET NULL;
ALTER TABLE nl_studio_sessions ADD COLUMN IF NOT EXISTS parent_snapshot_id UUID REFERENCES nl_studio_snapshots(id) ON DELETE SET NULL;
ALTER TABLE nl_studio_sessions ADD COLUMN IF NOT EXISTS branch_label TEXT;

CREATE INDEX IF NOT EXISTS idx_agent_app_versions_app_created ON agent_app_versions(app_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_installations_agent_version ON app_installations(agent_id, installed_version);
CREATE INDEX IF NOT EXISTS idx_studio_sessions_parent ON nl_studio_sessions(parent_session_id, updated_at DESC);

ALTER TABLE agent_app_versions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_app_versions'
      AND policyname = 'deny_all_agent_app_versions'
  ) THEN
    CREATE POLICY "deny_all_agent_app_versions" ON agent_app_versions FOR ALL USING (FALSE);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'vault_permissions'::regclass
      AND conname = 'vault_permissions_subject_type_check'
  ) THEN
    ALTER TABLE vault_permissions DROP CONSTRAINT vault_permissions_subject_type_check;
  END IF;
END $$;

ALTER TABLE vault_permissions
  ADD CONSTRAINT vault_permissions_subject_type_check
  CHECK (subject_type IN ('super_agentos', 'subagent', 'workflow', 'session', 'sdk_credential', 'app', 'skill'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'vault_assignments'::regclass
      AND conname = 'vault_assignments_subject_type_check'
  ) THEN
    ALTER TABLE vault_assignments DROP CONSTRAINT vault_assignments_subject_type_check;
  END IF;
END $$;

ALTER TABLE vault_assignments
  ADD CONSTRAINT vault_assignments_subject_type_check
  CHECK (subject_type IN ('super_agentos', 'subagent', 'workflow', 'session', 'sdk_credential', 'app', 'skill'));

NOTIFY pgrst, 'reload schema';
