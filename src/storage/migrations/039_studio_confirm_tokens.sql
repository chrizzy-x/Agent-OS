-- AgentOS Migration 039: Durable Studio confirmation tokens for serverless approvals.
-- Additive only. Stores short-lived internal confirmation payloads without persisting raw token keys.

CREATE TABLE IF NOT EXISTS studio_confirm_tokens (
  key_hash TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS studio_confirm_tokens_expires_at_idx
  ON studio_confirm_tokens(expires_at);

ALTER TABLE studio_confirm_tokens ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'studio_confirm_tokens'
      AND policyname = 'deny_all_studio_confirm_tokens'
  ) THEN
    CREATE POLICY "deny_all_studio_confirm_tokens"
      ON studio_confirm_tokens
      FOR ALL
      USING (FALSE)
      WITH CHECK (FALSE);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ROLLBACK:
-- DROP TABLE IF EXISTS studio_confirm_tokens;
