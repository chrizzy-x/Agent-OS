-- AgentOS Migration 023: formalize FFP execution audit persistence and
-- remove legacy public plan identifiers from persisted runtime state.
-- Additive and backfill-safe.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS ffp_chain_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  scoped_agent_id TEXT NOT NULL,
  proposal_id TEXT,
  tool TEXT NOT NULL,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  consensus_threshold NUMERIC,
  validator_count INTEGER,
  input_hash TEXT,
  fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
  fallback_reason TEXT,
  invoked_by_type TEXT,
  invoked_by_id TEXT,
  route_decision JSONB NOT NULL DEFAULT '{}'::jsonb,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ffp_chain_executions
  ADD COLUMN IF NOT EXISTS scoped_agent_id TEXT NOT NULL DEFAULT '';

ALTER TABLE ffp_chain_executions
  ADD COLUMN IF NOT EXISTS fallback_used BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE ffp_chain_executions
  ADD COLUMN IF NOT EXISTS fallback_reason TEXT;

ALTER TABLE ffp_chain_executions
  ADD COLUMN IF NOT EXISTS invoked_by_type TEXT;

ALTER TABLE ffp_chain_executions
  ADD COLUMN IF NOT EXISTS invoked_by_id TEXT;

ALTER TABLE ffp_chain_executions
  ADD COLUMN IF NOT EXISTS route_decision JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE ffp_chain_executions
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE ffp_chain_executions
SET scoped_agent_id = CONCAT('ffp:', COALESCE(chain_id, 'chain'), ':', COALESCE(agent_id, 'agent'))
WHERE scoped_agent_id = '';

CREATE INDEX IF NOT EXISTS idx_ffp_chain_executions_chain
  ON ffp_chain_executions(chain_id, executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_ffp_chain_executions_tool
  ON ffp_chain_executions(tool, executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_ffp_chain_executions_invoker
  ON ffp_chain_executions(invoked_by_type, invoked_by_id, executed_at DESC);

ALTER TABLE ffp_chain_executions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ffp_chain_executions'
      AND policyname = 'deny_all_ffp_chain_executions'
  ) THEN
    CREATE POLICY "deny_all_ffp_chain_executions"
      ON ffp_chain_executions
      FOR ALL
      USING (FALSE);
  END IF;
END $$;

UPDATE agents
SET tier = CASE tier
  WHEN 'free' THEN 'retail_free'
  WHEN 'pro' THEN 'retail_pro'
  WHEN 'enterprise' THEN 'enterprise_plus'
  WHEN 'hyper' THEN 'enterprise_max'
  ELSE tier
END
WHERE tier IN ('free', 'pro', 'enterprise', 'hyper');

UPDATE agents
SET metadata = jsonb_set(
  jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{plan}',
    to_jsonb((
      CASE COALESCE(metadata->>'plan', tier)
        WHEN 'free' THEN 'retail_free'
        WHEN 'pro' THEN 'retail_pro'
        WHEN 'enterprise' THEN 'enterprise_plus'
        WHEN 'hyper' THEN 'enterprise_max'
        ELSE COALESCE(metadata->>'plan', tier, 'retail_free')
      END
    )::text),
    true
  ),
  '{account_type}',
  to_jsonb((
    CASE
      WHEN COALESCE(metadata->>'plan', tier) IN ('enterprise', 'hyper', 'enterprise_plus', 'enterprise_max') THEN 'enterprise'
      ELSE 'retail'
    END
  )::text),
  true
)
WHERE COALESCE(metadata->>'plan', tier) IN ('free', 'pro', 'enterprise', 'hyper');

UPDATE workspaces
SET plan = CASE plan
  WHEN 'free' THEN 'retail_free'
  WHEN 'pro' THEN 'retail_pro'
  WHEN 'enterprise' THEN 'enterprise_plus'
  WHEN 'hyper' THEN 'enterprise_max'
  ELSE plan
END
WHERE plan IN ('free', 'pro', 'enterprise', 'hyper');

UPDATE plan_transitions
SET old_plan = CASE old_plan
  WHEN 'free' THEN 'retail_free'
  WHEN 'pro' THEN 'retail_pro'
  WHEN 'enterprise' THEN 'enterprise_plus'
  WHEN 'hyper' THEN 'enterprise_max'
  ELSE old_plan
END,
new_plan = CASE new_plan
  WHEN 'free' THEN 'retail_free'
  WHEN 'pro' THEN 'retail_pro'
  WHEN 'enterprise' THEN 'enterprise_plus'
  WHEN 'hyper' THEN 'enterprise_max'
  ELSE new_plan
END
WHERE old_plan IN ('free', 'pro', 'enterprise', 'hyper')
   OR new_plan IN ('free', 'pro', 'enterprise', 'hyper');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'agents_tier_check'
      AND conrelid = 'agents'::regclass
  ) THEN
    ALTER TABLE agents DROP CONSTRAINT agents_tier_check;
  END IF;
END $$;

ALTER TABLE agents
  ADD CONSTRAINT agents_tier_check
  CHECK (tier IN ('retail_free', 'retail_pro', 'enterprise_plus', 'enterprise_max'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workspaces_plan_check'
      AND conrelid = 'workspaces'::regclass
  ) THEN
    ALTER TABLE workspaces DROP CONSTRAINT workspaces_plan_check;
  END IF;
END $$;

ALTER TABLE workspaces
  ADD CONSTRAINT workspaces_plan_check
  CHECK (plan IN ('retail_free', 'retail_pro', 'enterprise_plus', 'enterprise_max'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'plan_transitions_old_plan_check'
      AND conrelid = 'plan_transitions'::regclass
  ) THEN
    ALTER TABLE plan_transitions DROP CONSTRAINT plan_transitions_old_plan_check;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'plan_transitions_new_plan_check'
      AND conrelid = 'plan_transitions'::regclass
  ) THEN
    ALTER TABLE plan_transitions DROP CONSTRAINT plan_transitions_new_plan_check;
  END IF;
END $$;

ALTER TABLE plan_transitions
  ADD CONSTRAINT plan_transitions_old_plan_check
  CHECK (old_plan IN ('retail_free', 'retail_pro', 'enterprise_plus', 'enterprise_max'));

ALTER TABLE plan_transitions
  ADD CONSTRAINT plan_transitions_new_plan_check
  CHECK (new_plan IN ('retail_free', 'retail_pro', 'enterprise_plus', 'enterprise_max'));

NOTIFY pgrst, 'reload schema';
