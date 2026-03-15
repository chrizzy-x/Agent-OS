-- AgentOS Migration 006: MCP routing and autonomous operations crew
-- Additive only. Safe to run after migrations 001-005.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS mcp_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  category TEXT,
  tools JSONB NOT NULL DEFAULT '[]'::jsonb,
  requires_consensus BOOLEAN NOT NULL DEFAULT FALSE,
  consensus_threshold NUMERIC NOT NULL DEFAULT 0.67,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  icon TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mcp_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  mcp_server TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  params JSONB,
  proposal_id UUID,
  consensus_approved BOOLEAN,
  consensus_votes JSONB,
  result JSONB,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error_message TEXT,
  execution_time_ms INTEGER,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  action TEXT NOT NULL,
  params JSONB,
  confidence NUMERIC,
  reasoning TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  vote TEXT NOT NULL,
  confidence NUMERIC,
  reasoning TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(proposal_id, agent_id)
);

CREATE TABLE IF NOT EXISTS chain_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  action TEXT NOT NULL,
  data JSONB,
  block_hash TEXT,
  previous_hash TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feature_catalog (
  slug TEXT PRIMARY KEY,
  id INTEGER NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  category_name TEXT NOT NULL,
  category_badge TEXT NOT NULL,
  category_description TEXT NOT NULL,
  summary TEXT NOT NULL,
  details TEXT NOT NULL,
  competitor TEXT NOT NULL,
  standout TEXT NOT NULL,
  use_cases JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS infra_agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  specialty TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'healthy',
  heartbeat_at TIMESTAMPTZ,
  health_score NUMERIC NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feature_agent_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_slug TEXT NOT NULL REFERENCES feature_catalog(slug) ON DELETE CASCADE,
  infra_agent_id TEXT NOT NULL REFERENCES infra_agents(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'healthy',
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_failover_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(feature_slug, role),
  UNIQUE(infra_agent_id)
);

CREATE TABLE IF NOT EXISTS crew_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_slug TEXT NOT NULL REFERENCES feature_catalog(slug) ON DELETE CASCADE,
  infra_agent_id TEXT REFERENCES infra_agents(id) ON DELETE SET NULL,
  task_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  priority INTEGER NOT NULL DEFAULT 100,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  last_error TEXT,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crew_failover_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_slug TEXT NOT NULL REFERENCES feature_catalog(slug) ON DELETE CASCADE,
  from_agent_id TEXT,
  to_agent_id TEXT,
  reason TEXT NOT NULL,
  triggered_by TEXT NOT NULL DEFAULT 'system',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crew_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_slug TEXT NOT NULL REFERENCES feature_catalog(slug) ON DELETE CASCADE,
  infra_agent_id TEXT NOT NULL REFERENCES infra_agents(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  health_score NUMERIC NOT NULL,
  summary TEXT NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crew_settings (
  scope TEXT PRIMARY KEY DEFAULT 'global',
  operation_mode TEXT NOT NULL DEFAULT 'single_agent',
  consensus_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_calls_agent ON mcp_calls(agent_id);
CREATE INDEX IF NOT EXISTS idx_mcp_calls_server ON mcp_calls(mcp_server);
CREATE INDEX IF NOT EXISTS idx_proposals_agent ON proposals(agent_id);
CREATE INDEX IF NOT EXISTS idx_votes_proposal ON votes(proposal_id);
CREATE INDEX IF NOT EXISTS idx_chain_logs_agent ON chain_logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_feature_catalog_kind ON feature_catalog(kind);
CREATE INDEX IF NOT EXISTS idx_infra_agents_status ON infra_agents(status);
CREATE INDEX IF NOT EXISTS idx_feature_agent_pairs_feature ON feature_agent_pairs(feature_slug);
CREATE INDEX IF NOT EXISTS idx_crew_tasks_feature_status ON crew_tasks(feature_slug, status);
CREATE INDEX IF NOT EXISTS idx_crew_tasks_schedule ON crew_tasks(scheduled_for, status);
CREATE INDEX IF NOT EXISTS idx_crew_failover_feature ON crew_failover_events(feature_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crew_health_feature ON crew_health_snapshots(feature_slug, created_at DESC);

ALTER TABLE mcp_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE chain_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE infra_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_agent_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_failover_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_health_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mcp_servers' AND policyname = 'deny_all_mcp_servers') THEN
    CREATE POLICY deny_all_mcp_servers ON mcp_servers FOR ALL USING (FALSE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mcp_calls' AND policyname = 'deny_all_mcp_calls') THEN
    CREATE POLICY deny_all_mcp_calls ON mcp_calls FOR ALL USING (FALSE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'proposals' AND policyname = 'deny_all_proposals') THEN
    CREATE POLICY deny_all_proposals ON proposals FOR ALL USING (FALSE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'votes' AND policyname = 'deny_all_votes') THEN
    CREATE POLICY deny_all_votes ON votes FOR ALL USING (FALSE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'chain_logs' AND policyname = 'deny_all_chain_logs') THEN
    CREATE POLICY deny_all_chain_logs ON chain_logs FOR ALL USING (FALSE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'feature_catalog' AND policyname = 'deny_all_feature_catalog') THEN
    CREATE POLICY deny_all_feature_catalog ON feature_catalog FOR ALL USING (FALSE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'infra_agents' AND policyname = 'deny_all_infra_agents') THEN
    CREATE POLICY deny_all_infra_agents ON infra_agents FOR ALL USING (FALSE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'feature_agent_pairs' AND policyname = 'deny_all_feature_agent_pairs') THEN
    CREATE POLICY deny_all_feature_agent_pairs ON feature_agent_pairs FOR ALL USING (FALSE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crew_tasks' AND policyname = 'deny_all_crew_tasks') THEN
    CREATE POLICY deny_all_crew_tasks ON crew_tasks FOR ALL USING (FALSE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crew_failover_events' AND policyname = 'deny_all_crew_failover_events') THEN
    CREATE POLICY deny_all_crew_failover_events ON crew_failover_events FOR ALL USING (FALSE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crew_health_snapshots' AND policyname = 'deny_all_crew_health_snapshots') THEN
    CREATE POLICY deny_all_crew_health_snapshots ON crew_health_snapshots FOR ALL USING (FALSE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crew_settings' AND policyname = 'deny_all_crew_settings') THEN
    CREATE POLICY deny_all_crew_settings ON crew_settings FOR ALL USING (FALSE);
  END IF;
END $$;

INSERT INTO crew_settings (scope, operation_mode, consensus_mode_enabled)
VALUES ('global', 'single_agent', FALSE)
ON CONFLICT (scope) DO NOTHING;

INSERT INTO mcp_servers (name, url, description, category, tools, icon)
VALUES
  ('gmail', 'https://gmail.mcp.anthropic.com', 'Send and read Gmail email', 'Communication', '[]'::jsonb, 'gmail'),
  ('slack', 'https://slack.mcp.anthropic.com', 'Send and read Slack messages', 'Communication', '[]'::jsonb, 'slack'),
  ('google-drive', 'https://drive.mcp.anthropic.com', 'Access Google Drive files', 'Productivity', '[]'::jsonb, 'drive'),
  ('github', 'https://github.mcp.anthropic.com', 'Manage GitHub repositories', 'Development', '[]'::jsonb, 'github')
ON CONFLICT (name) DO NOTHING;
