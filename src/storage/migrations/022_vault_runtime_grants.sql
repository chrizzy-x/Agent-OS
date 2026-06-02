-- Durable runtime secret grants for SDK and internal runtime secret injection.

CREATE TABLE IF NOT EXISTS vault_runtime_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_id UUID NOT NULL REFERENCES vault_secrets(id) ON DELETE CASCADE,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL,
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  cleaned_up_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vault_runtime_grants_status_check
    CHECK (status IN ('active', 'consumed', 'cleaned', 'expired'))
);

CREATE INDEX IF NOT EXISTS vault_runtime_grants_owner_idx
  ON vault_runtime_grants(owner_agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS vault_runtime_grants_secret_idx
  ON vault_runtime_grants(secret_id, status, expires_at);

CREATE INDEX IF NOT EXISTS vault_runtime_grants_subject_idx
  ON vault_runtime_grants(subject_type, subject_id, status);

ALTER TABLE vault_runtime_grants ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vault_runtime_grants'
      AND policyname = 'deny_all_vault_runtime_grants'
  ) THEN
    CREATE POLICY "deny_all_vault_runtime_grants"
      ON vault_runtime_grants
      FOR ALL
      USING (FALSE)
      WITH CHECK (FALSE);
  END IF;
END$$;
