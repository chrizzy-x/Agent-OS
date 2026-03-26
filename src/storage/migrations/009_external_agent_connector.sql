-- AgentOS Migration 009: external agent connector
-- Additive only.

CREATE TABLE IF NOT EXISTS external_agent_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  owner_email TEXT,
  allowed_domains TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  allowed_tools TEXT[] NOT NULL DEFAULT ARRAY[
    'agentos.mem_set','agentos.mem_get','agentos.mem_delete','agentos.mem_list','agentos.mem_incr','agentos.mem_expire',
    'agentos.net_http_get','agentos.net_http_post','agentos.net_http_put','agentos.net_http_delete','agentos.net_dns_resolve',
    'agentos.db_query','agentos.db_create_table','agentos.db_insert','agentos.db_update','agentos.db_delete','agentos.db_transaction',
    'agentos.fs_write','agentos.fs_read','agentos.fs_list','agentos.fs_delete','agentos.fs_mkdir','agentos.fs_stat',
    'agentos.events_publish','agentos.events_subscribe','agentos.events_unsubscribe','agentos.events_list_topics',
    'agentos.proc_execute','agentos.proc_schedule','agentos.proc_spawn','agentos.proc_kill','agentos.proc_list'
  ]::TEXT[],
  status TEXT NOT NULL DEFAULT 'active',
  total_calls INTEGER NOT NULL DEFAULT 0,
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ext_reg_agent_id ON external_agent_registrations(agent_id);
CREATE INDEX IF NOT EXISTS idx_ext_reg_owner_email ON external_agent_registrations(owner_email);

ALTER TABLE external_agent_registrations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE tablename = 'external_agent_registrations'
      AND policyname = 'deny_all_external_agent_registrations'
  ) THEN
    CREATE POLICY deny_all_external_agent_registrations
      ON external_agent_registrations
      FOR ALL
      USING (FALSE);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION increment_ext_agent_calls(row_agent_id TEXT)
RETURNS VOID AS $$
  UPDATE external_agent_registrations
  SET total_calls = total_calls + 1,
      last_active_at = NOW()
  WHERE agent_id = row_agent_id;
$$ LANGUAGE SQL;
