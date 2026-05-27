-- AgentOS Migration 013: Enterprise app publishing tier
-- App publishing requires an enterprise subscription. Hyper remains accepted as
-- the legacy enterprise-equivalent tier for existing deployments.

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'free';

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
  CHECK (tier IN ('free', 'pro', 'hyper', 'enterprise'));

NOTIFY pgrst, 'reload schema';
