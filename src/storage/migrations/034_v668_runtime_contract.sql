-- AgentOS Migration 034: V6.6.8 runtime registry, capability contract, and task lifecycle.
-- Additive only.

ALTER TABLE capability_registry
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'AgentOS',
  ADD COLUMN IF NOT EXISTS version TEXT NOT NULL DEFAULT '6.6.8',
  ADD COLUMN IF NOT EXISTS health_status TEXT NOT NULL DEFAULT 'healthy',
  ADD COLUMN IF NOT EXISTS dependencies JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cost_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS compute_requirement JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS supported_models JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS supported_context_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS execution_priority INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC NOT NULL DEFAULT 0.9,
  ADD COLUMN IF NOT EXISTS fallback_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE capability_registry DROP CONSTRAINT IF EXISTS capability_registry_health_status_check;
ALTER TABLE capability_registry
  ADD CONSTRAINT capability_registry_health_status_check
  CHECK (health_status IN ('healthy', 'warning', 'unavailable', 'deprecated', 'failed', 'disabled'));

CREATE INDEX IF NOT EXISTS capability_registry_provider_idx
  ON capability_registry(owner_agent_id, provider, version, updated_at DESC);
CREATE INDEX IF NOT EXISTS capability_registry_health_idx
  ON capability_registry(owner_agent_id, health_status, status, updated_at DESC);

ALTER TABLE agent_tasks
  ADD COLUMN IF NOT EXISTS parent_task_id TEXT,
  ADD COLUMN IF NOT EXISTS root_execution_id TEXT,
  ADD COLUMN IF NOT EXISTS planner_version TEXT NOT NULL DEFAULT 'super-agentos-planner-v6.6.8',
  ADD COLUMN IF NOT EXISTS context_version TEXT,
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS execution_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

UPDATE agent_tasks
SET root_execution_id = id
WHERE root_execution_id IS NULL;

ALTER TABLE agent_tasks
  ALTER COLUMN root_execution_id SET NOT NULL;

ALTER TABLE agent_tasks DROP CONSTRAINT IF EXISTS agent_tasks_status_check;
ALTER TABLE agent_tasks
  ADD CONSTRAINT agent_tasks_status_check
  CHECK (status IN (
    'created',
    'queued',
    'planning',
    'waiting_for_dependencies',
    'waiting_for_approval',
    'awaiting_confirmation',
    'scheduled',
    'running',
    'paused',
    'retrying',
    'cancelling',
    'completed',
    'failed',
    'cancelled',
    'needs_configuration',
    'archived'
  ));

ALTER TABLE agent_tasks DROP CONSTRAINT IF EXISTS agent_tasks_priority_check;
ALTER TABLE agent_tasks
  ADD CONSTRAINT agent_tasks_priority_check
  CHECK (priority IN ('critical', 'high', 'normal', 'low', 'background'));

CREATE INDEX IF NOT EXISTS agent_tasks_root_execution_idx
  ON agent_tasks(root_execution_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS agent_tasks_priority_idx
  ON agent_tasks(user_id, priority, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS agent_tasks_context_version_idx
  ON agent_tasks(context_version, updated_at DESC);

ALTER TABLE agent_task_steps DROP CONSTRAINT IF EXISTS agent_task_steps_status_check;
ALTER TABLE agent_task_steps
  ADD CONSTRAINT agent_task_steps_status_check
  CHECK (status IN (
    'queued',
    'planning',
    'waiting_for_dependencies',
    'waiting_for_approval',
    'scheduled',
    'running',
    'paused',
    'retrying',
    'completed',
    'failed',
    'cancelled',
    'needs_configuration'
  ));

NOTIFY pgrst, 'reload schema';
