-- AgentOS Migration 014: Studio recurring workflows
-- Durable in-app results for NL Studio schedules.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS agent_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  summary TEXT,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  schedule TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  task_id TEXT,
  last_result JSONB,
  last_error TEXT,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE agent_workflows ADD COLUMN IF NOT EXISTS task_id TEXT;
ALTER TABLE agent_workflows ADD COLUMN IF NOT EXISTS last_result JSONB;
ALTER TABLE agent_workflows ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE agent_workflows ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ;
ALTER TABLE agent_workflows ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS workflow_id UUID;
ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS last_result JSONB;
ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS last_success BOOLEAN;

CREATE INDEX IF NOT EXISTS agent_workflows_agent_id_idx ON agent_workflows(agent_id);
CREATE INDEX IF NOT EXISTS agent_workflows_task_id_idx ON agent_workflows(task_id);
CREATE INDEX IF NOT EXISTS scheduled_tasks_workflow_id_idx ON scheduled_tasks(workflow_id);

ALTER TABLE agent_workflows ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'agent_workflows' AND policyname = 'deny_all_agent_workflows') THEN
    CREATE POLICY "deny_all_agent_workflows" ON agent_workflows FOR ALL USING (FALSE);
  END IF;
END $$;

GRANT ALL ON agent_workflows TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON agent_workflows TO authenticated;
GRANT SELECT ON agent_workflows TO anon;

NOTIFY pgrst, 'reload schema';
