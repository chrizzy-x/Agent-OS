-- AgentOS Migration 032: OS contract publishing, media, review, and webhook fields.
-- Additive only.

ALTER TABLE agent_apps DROP CONSTRAINT IF EXISTS agent_apps_publish_state_check;
ALTER TABLE agent_apps
  ADD COLUMN IF NOT EXISTS support_url TEXT,
  ADD COLUMN IF NOT EXISTS privacy_policy_url TEXT,
  ADD COLUMN IF NOT EXISTS terms_url TEXT,
  ADD COLUMN IF NOT EXISTS pricing JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS gallery JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS media_assets JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD CONSTRAINT agent_apps_publish_state_check
  CHECK (publish_state IN ('draft', 'submitted', 'reviewing', 'approved', 'rejected', 'published', 'update_pending', 'unpublished'));

ALTER TABLE skills DROP CONSTRAINT IF EXISTS skills_publish_state_check;
ALTER TABLE skills
  ADD COLUMN IF NOT EXISTS support_url TEXT,
  ADD COLUMN IF NOT EXISTS privacy_policy_url TEXT,
  ADD COLUMN IF NOT EXISTS terms_url TEXT,
  ADD COLUMN IF NOT EXISTS gallery JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS media_assets JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS compatible_apps JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS compatible_agents JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS compatible_workflows JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD CONSTRAINT skills_publish_state_check
  CHECK (publish_state IN ('draft', 'submitted', 'reviewing', 'approved', 'rejected', 'published', 'update_pending', 'unpublished'));

CREATE TABLE IF NOT EXISTS developer_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  callback_url TEXT NOT NULL,
  secret_masked TEXT NOT NULL DEFAULT 'not set',
  events JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_delivery_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS developer_webhooks_owner_idx
  ON developer_webhooks(owner_agent_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS developer_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES developer_webhooks(id) ON DELETE CASCADE,
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('success', 'failure', 'retrying')),
  event TEXT NOT NULL,
  response_code INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS developer_webhook_logs_owner_idx
  ON developer_webhook_logs(owner_agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS developer_webhook_logs_webhook_idx
  ON developer_webhook_logs(webhook_id, created_at DESC);

ALTER TABLE developer_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE developer_webhook_logs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['developer_webhooks', 'developer_webhook_logs'] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t
        AND policyname = 'deny_all_' || t
    ) THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (FALSE)', 'deny_all_' || t, t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
