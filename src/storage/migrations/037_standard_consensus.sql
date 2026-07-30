-- AgentOS Migration 037: Standard Consensus records for Super AgentOS.
-- Additive consensus persistence only. This does not activate or claim FFP.

ALTER TABLE intelligence_defaults
  ALTER COLUMN consensus_configuration_id TYPE TEXT USING consensus_configuration_id::TEXT;
ALTER TABLE studio_session_intelligence
  ALTER COLUMN consensus_configuration_id TYPE TEXT USING consensus_configuration_id::TEXT;
ALTER TABLE intelligence_invocations
  ALTER COLUMN consensus_configuration_id TYPE TEXT USING consensus_configuration_id::TEXT;

CREATE TABLE IF NOT EXISTS intelligence_consensus_configurations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  strategy TEXT NOT NULL DEFAULT 'standard'
    CHECK (strategy IN ('standard')),
  worker_selections JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(worker_selections) = 'array'),
  quorum_count INTEGER NOT NULL DEFAULT 2 CHECK (quorum_count >= 2),
  preserve_dissent BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS intelligence_consensus_configurations_owner_idx
  ON intelligence_consensus_configurations(owner_agent_id, workspace_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS intelligence_consensus_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES nl_studio_sessions(id) ON DELETE SET NULL,
  task_id TEXT REFERENCES agent_tasks(id) ON DELETE SET NULL,
  execution_id UUID REFERENCES agent_executions(id) ON DELETE SET NULL,
  consensus_configuration_id TEXT NOT NULL,
  worker_run_id UUID REFERENCES intelligence_worker_runs(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  request_hash TEXT NOT NULL,
  consensus_hash TEXT,
  configuration_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  dissent JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(dissent) = 'array'),
  usage JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS intelligence_consensus_records_owner_idx
  ON intelligence_consensus_records(owner_agent_id, workspace_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS intelligence_consensus_records_session_idx
  ON intelligence_consensus_records(session_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS intelligence_consensus_records_worker_run_idx
  ON intelligence_consensus_records(worker_run_id);
CREATE INDEX IF NOT EXISTS intelligence_consensus_records_hash_idx
  ON intelligence_consensus_records(consensus_hash);

ALTER TABLE intelligence_consensus_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_consensus_records ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'intelligence_consensus_configurations',
    'intelligence_consensus_records'
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
-- DROP TABLE IF EXISTS intelligence_consensus_records;
-- DROP TABLE IF EXISTS intelligence_consensus_configurations;
-- ALTER TABLE intelligence_invocations ALTER COLUMN consensus_configuration_id TYPE UUID USING consensus_configuration_id::UUID;
-- ALTER TABLE studio_session_intelligence ALTER COLUMN consensus_configuration_id TYPE UUID USING consensus_configuration_id::UUID;
-- ALTER TABLE intelligence_defaults ALTER COLUMN consensus_configuration_id TYPE UUID USING consensus_configuration_id::UUID;
