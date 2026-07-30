-- AgentOS Migration 035: Super AgentOS connected intelligence persistence.
-- Additive only. Native Super AgentOS remains the default when no connection exists.

CREATE TABLE IF NOT EXISTS intelligence_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  vault_secret_id UUID NOT NULL REFERENCES vault_secrets(id) ON DELETE RESTRICT,
  vendor TEXT NOT NULL CHECK (vendor IN ('openai', 'anthropic', 'gemini')),
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_validation'
    CHECK (status IN ('pending_validation', 'active', 'invalid', 'disabled', 'revoked')),
  selected_model_id TEXT NOT NULL,
  available_models JSONB NOT NULL DEFAULT '[]'::jsonb,
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  health JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_validated_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS intelligence_connections_owner_idx
  ON intelligence_connections(owner_agent_id, workspace_id, status, vendor, updated_at DESC);
CREATE INDEX IF NOT EXISTS intelligence_connections_secret_idx
  ON intelligence_connections(vault_secret_id, status);

CREATE TABLE IF NOT EXISTS intelligence_defaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('user', 'workspace')),
  mode TEXT NOT NULL DEFAULT 'native' CHECK (mode IN ('native', 'single', 'consensus')),
  connection_id UUID REFERENCES intelligence_connections(id) ON DELETE SET NULL,
  model_id TEXT,
  consensus_configuration_id UUID,
  selection_source TEXT NOT NULL DEFAULT 'native_default'
    CHECK (selection_source IN ('message', 'session', 'workspace', 'user', 'native_default')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT intelligence_defaults_native_shape
    CHECK (
      (mode = 'native' AND connection_id IS NULL AND model_id IS NULL AND consensus_configuration_id IS NULL)
      OR (mode = 'single' AND connection_id IS NOT NULL AND model_id IS NOT NULL AND consensus_configuration_id IS NULL)
      OR (mode = 'consensus' AND connection_id IS NULL AND model_id IS NULL AND consensus_configuration_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS intelligence_defaults_user_unique_idx
  ON intelligence_defaults(owner_agent_id, scope)
  WHERE scope = 'user' AND workspace_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS intelligence_defaults_workspace_unique_idx
  ON intelligence_defaults(owner_agent_id, workspace_id, scope)
  WHERE scope = 'workspace' AND workspace_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS studio_session_intelligence (
  session_id TEXT PRIMARY KEY REFERENCES nl_studio_sessions(id) ON DELETE CASCADE,
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'native' CHECK (mode IN ('native', 'single', 'consensus')),
  connection_id UUID REFERENCES intelligence_connections(id) ON DELETE SET NULL,
  model_id TEXT,
  consensus_configuration_id UUID,
  selection_source TEXT NOT NULL DEFAULT 'native_default'
    CHECK (selection_source IN ('message', 'session', 'workspace', 'user', 'native_default')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT studio_session_intelligence_shape
    CHECK (
      (mode = 'native' AND connection_id IS NULL AND model_id IS NULL AND consensus_configuration_id IS NULL)
      OR (mode = 'single' AND connection_id IS NOT NULL AND model_id IS NOT NULL AND consensus_configuration_id IS NULL)
      OR (mode = 'consensus' AND connection_id IS NULL AND model_id IS NULL AND consensus_configuration_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS studio_session_intelligence_owner_idx
  ON studio_session_intelligence(owner_agent_id, workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS studio_session_intelligence_connection_idx
  ON studio_session_intelligence(connection_id);

CREATE TABLE IF NOT EXISTS intelligence_invocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  session_id TEXT REFERENCES nl_studio_sessions(id) ON DELETE SET NULL,
  task_id TEXT REFERENCES agent_tasks(id) ON DELETE SET NULL,
  execution_id UUID REFERENCES agent_executions(id) ON DELETE SET NULL,
  connection_id UUID REFERENCES intelligence_connections(id) ON DELETE SET NULL,
  mode TEXT NOT NULL CHECK (mode IN ('native', 'single', 'consensus')),
  vendor TEXT CHECK (vendor IS NULL OR vendor IN ('openai', 'anthropic', 'gemini')),
  model_id TEXT,
  consensus_configuration_id UUID,
  selection_source TEXT NOT NULL
    CHECK (selection_source IN ('message', 'session', 'workspace', 'user', 'native_default')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  request_fingerprint TEXT,
  context_manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  usage JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS intelligence_invocations_owner_idx
  ON intelligence_invocations(owner_agent_id, workspace_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS intelligence_invocations_session_idx
  ON intelligence_invocations(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS intelligence_invocations_connection_idx
  ON intelligence_invocations(connection_id, status, created_at DESC);

ALTER TABLE intelligence_invocations
  ADD COLUMN IF NOT EXISTS consensus_configuration_id UUID;

ALTER TABLE nl_studio_sessions
  ADD COLUMN IF NOT EXISTS intelligence_selection JSONB NOT NULL DEFAULT
    '{"mode":"native","connectionId":null,"modelId":null,"consensusConfigurationId":null,"selectionSource":"native_default"}'::jsonb;

ALTER TABLE intelligence_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_session_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_invocations ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'intelligence_connections',
    'intelligence_defaults',
    'studio_session_intelligence',
    'intelligence_invocations'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t
        AND policyname = 'deny_all_' || t
    ) THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (FALSE) WITH CHECK (FALSE)', 'deny_all_' || t, t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ROLLBACK:
-- ALTER TABLE nl_studio_sessions DROP COLUMN IF EXISTS intelligence_selection;
-- DROP TABLE IF EXISTS intelligence_invocations;
-- DROP TABLE IF EXISTS studio_session_intelligence;
-- DROP TABLE IF EXISTS intelligence_defaults;
-- DROP TABLE IF EXISTS intelligence_connections;
