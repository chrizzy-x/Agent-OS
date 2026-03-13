-- AgentOS Initial Schema Migration
-- Run this against your Supabase PostgreSQL database before deploying

-- Agents registry — each row represents a registered AI agent
CREATE TABLE IF NOT EXISTS agents (
  id          TEXT PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name        TEXT,
  -- JSON blob: { storage_quota_bytes, memory_quota_bytes, rate_limit_per_min, allowed_domains[] }
  quotas      JSONB NOT NULL DEFAULT '{}',
  metadata    JSONB NOT NULL DEFAULT '{}'
);

-- File metadata — tracks files stored in Supabase Storage
CREATE TABLE IF NOT EXISTS agent_files (
  id          BIGSERIAL PRIMARY KEY,
  agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  path        TEXT NOT NULL,
  size_bytes  BIGINT NOT NULL DEFAULT 0,
  content_type TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata    JSONB NOT NULL DEFAULT '{}',
  UNIQUE(agent_id, path)
);

CREATE INDEX IF NOT EXISTS agent_files_agent_id_idx ON agent_files(agent_id);

-- Audit log — immutable record of every primitive operation
CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  agent_id    TEXT NOT NULL,
  primitive   TEXT NOT NULL,   -- fs, net, proc, mem, db, events
  operation   TEXT NOT NULL,   -- write, read, http_get, execute, etc.
  success     BOOLEAN NOT NULL,
  duration_ms INTEGER,
  metadata    JSONB NOT NULL DEFAULT '{}',
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_agent_id_idx ON audit_logs(agent_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at);

-- Scheduled tasks — cron jobs registered via proc.schedule
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agent_id        TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  code            TEXT NOT NULL,
  language        TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at     TIMESTAMPTZ,
  next_run_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scheduled_tasks_agent_id_idx ON scheduled_tasks(agent_id);

-- Process executions — records of proc.execute calls
CREATE TABLE IF NOT EXISTS agent_processes (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  language    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'running',  -- running, completed, failed, killed
  exit_code   INTEGER,
  stdout      TEXT,
  stderr      TEXT,
  duration_ms INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS agent_processes_agent_id_idx ON agent_processes(agent_id);
CREATE INDEX IF NOT EXISTS agent_processes_status_idx ON agent_processes(status);

-- Enable Row Level Security on all tables
-- AgentOS uses service role key which bypasses RLS, but enabling RLS
-- ensures no accidental direct client access exposes cross-agent data
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_processes ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (bypasses RLS automatically)
-- Deny all access for anonymous and authenticated roles
CREATE POLICY "deny_all_agents" ON agents FOR ALL USING (FALSE);
CREATE POLICY "deny_all_agent_files" ON agent_files FOR ALL USING (FALSE);
CREATE POLICY "deny_all_audit_logs" ON audit_logs FOR ALL USING (FALSE);
CREATE POLICY "deny_all_scheduled_tasks" ON scheduled_tasks FOR ALL USING (FALSE);
CREATE POLICY "deny_all_agent_processes" ON agent_processes FOR ALL USING (FALSE);
