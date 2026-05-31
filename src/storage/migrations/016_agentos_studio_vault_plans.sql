-- AgentOS Migration 016: Studio-first plans, provisioning, Vault, and private subagents.
-- Additive and backward-compatible with legacy tiers.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agents_tier_check'
      AND conrelid = 'agents'::regclass
  ) THEN
    ALTER TABLE agents DROP CONSTRAINT agents_tier_check;
  END IF;
END $$;

ALTER TABLE agents
  ADD CONSTRAINT agents_tier_check
  CHECK (tier IN ('free', 'pro', 'hyper', 'enterprise', 'retail_free', 'retail_pro', 'enterprise_plus', 'enterprise_max'));

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'retail_free',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS workspace_agents (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, agent_id)
);

CREATE TABLE IF NOT EXISTS workspace_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS instruction_profiles (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  instructions TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS super_agents (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Super AgentOS',
  instruction_profile_id TEXT REFERENCES instruction_profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, owner_agent_id)
);

CREATE TABLE IF NOT EXISTS nl_studio_sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  super_agent_id TEXT REFERENCES super_agents(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'AgentOS Studio',
  status TEXT NOT NULL DEFAULT 'active',
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nl_studio_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL REFERENCES nl_studio_sessions(id) ON DELETE CASCADE,
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nl_studio_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  session_id TEXT NOT NULL REFERENCES nl_studio_sessions(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS private_subagents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  instructions TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vaults (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('personal', 'organization', 'team')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, scope)
);

CREATE TABLE IF NOT EXISTS vault_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  masked_value TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  version INTEGER NOT NULL DEFAULT 1,
  last_accessed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vault_id, name)
);

CREATE TABLE IF NOT EXISTS vault_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  secret_id UUID REFERENCES vault_secrets(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE agent_workflows ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE agent_workflows ADD COLUMN IF NOT EXISTS graph_state JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb;
ALTER TABLE agent_workflows ADD COLUMN IF NOT EXISTS code_state TEXT NOT NULL DEFAULT '{ "version": "1.0.0", "nodes": [], "edges": [] }';
ALTER TABLE agent_workflows ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS workspaces_owner_idx ON workspaces(owner_id);
CREATE INDEX IF NOT EXISTS workspace_members_user_idx ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS workspace_agents_agent_idx ON workspace_agents(agent_id);
CREATE INDEX IF NOT EXISTS workspace_audit_workspace_idx ON workspace_audit_logs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS super_agents_owner_idx ON super_agents(owner_agent_id);
CREATE INDEX IF NOT EXISTS studio_sessions_owner_idx ON nl_studio_sessions(owner_agent_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS studio_messages_session_idx ON nl_studio_messages(session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS studio_events_session_idx ON nl_studio_events(session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS private_subagents_owner_idx ON private_subagents(owner_agent_id, status);
CREATE INDEX IF NOT EXISTS vaults_owner_idx ON vaults(owner_agent_id);
CREATE INDEX IF NOT EXISTS vault_secrets_vault_idx ON vault_secrets(vault_id, name);
CREATE INDEX IF NOT EXISTS vault_access_logs_workspace_idx ON vault_access_logs(workspace_id, created_at DESC);

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE instruction_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE super_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE nl_studio_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE nl_studio_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE nl_studio_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_subagents ENABLE ROW LEVEL SECURITY;
ALTER TABLE vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_access_logs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'workspaces','workspace_members','workspace_agents','workspace_audit_logs',
    'instruction_profiles','super_agents','nl_studio_sessions','nl_studio_messages',
    'nl_studio_events','private_subagents','vaults','vault_secrets','vault_access_logs'
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
