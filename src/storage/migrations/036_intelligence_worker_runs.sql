-- AgentOS Migration 036: durable Super AgentOS multi-intelligence worker runs.
-- Additive only. Workers store isolated connected-intelligence outputs; Super AgentOS remains execution authority.

CREATE TABLE IF NOT EXISTS intelligence_worker_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES nl_studio_sessions(id) ON DELETE SET NULL,
  task_id TEXT REFERENCES agent_tasks(id) ON DELETE SET NULL,
  execution_id UUID REFERENCES agent_executions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  request_fingerprint TEXT,
  worker_count INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  cancelled_count INTEGER NOT NULL DEFAULT 0,
  usage JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS intelligence_worker_runs_owner_idx
  ON intelligence_worker_runs(owner_agent_id, workspace_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS intelligence_worker_runs_session_idx
  ON intelligence_worker_runs(session_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS intelligence_worker_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES intelligence_worker_runs(id) ON DELETE CASCADE,
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  worker_key TEXT NOT NULL,
  connection_id UUID REFERENCES intelligence_connections(id) ON DELETE SET NULL,
  invocation_id UUID REFERENCES intelligence_invocations(id) ON DELETE SET NULL,
  vendor TEXT CHECK (vendor IS NULL OR vendor IN ('openai', 'anthropic', 'gemini')),
  model_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  output_hash TEXT,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  usage JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, worker_key)
);

CREATE INDEX IF NOT EXISTS intelligence_worker_outputs_run_idx
  ON intelligence_worker_outputs(run_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS intelligence_worker_outputs_connection_idx
  ON intelligence_worker_outputs(connection_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS intelligence_worker_outputs_invocation_idx
  ON intelligence_worker_outputs(invocation_id);

ALTER TABLE intelligence_worker_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_worker_outputs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'intelligence_worker_runs',
    'intelligence_worker_outputs'
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
-- DROP TABLE IF EXISTS intelligence_worker_outputs;
-- DROP TABLE IF EXISTS intelligence_worker_runs;
