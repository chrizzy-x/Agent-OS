-- AgentOS Migration 003: Scheduled Task Runner Support
-- Adds a function called by Vercel Cron to execute due scheduled tasks.
-- Also adds helper views and indexes for operational queries.

-- Index for finding due scheduled tasks efficiently
CREATE INDEX IF NOT EXISTS scheduled_tasks_next_run_enabled_idx
  ON scheduled_tasks(next_run_at, enabled)
  WHERE enabled = TRUE;

-- Index for process age-based cleanup
CREATE INDEX IF NOT EXISTS agent_processes_completed_at_idx
  ON agent_processes(completed_at)
  WHERE completed_at IS NOT NULL;

-- View: agent storage summary (used by resource-manager quota checks as an optimized path)
CREATE OR REPLACE VIEW agent_storage_summary AS
SELECT
  agent_id,
  COUNT(*)          AS file_count,
  SUM(size_bytes)   AS total_bytes,
  MAX(updated_at)   AS last_updated
FROM agent_files
GROUP BY agent_id;

-- View: agent process stats
CREATE OR REPLACE VIEW agent_process_stats AS
SELECT
  agent_id,
  status,
  COUNT(*)                    AS count,
  AVG(duration_ms)            AS avg_duration_ms,
  MAX(created_at)             AS last_run_at
FROM agent_processes
GROUP BY agent_id, status;

-- Function: get due scheduled tasks (called by cron endpoint)
CREATE OR REPLACE FUNCTION get_due_scheduled_tasks(p_limit INTEGER DEFAULT 50)
RETURNS TABLE(
  id              TEXT,
  agent_id        TEXT,
  code            TEXT,
  language        TEXT,
  cron_expression TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id, agent_id, code, language, cron_expression
  FROM scheduled_tasks
  WHERE enabled = TRUE
    AND (next_run_at IS NULL OR next_run_at <= NOW())
  ORDER BY next_run_at ASC NULLS FIRST
  LIMIT p_limit;
$$;

-- Function: mark a scheduled task as having run, update next_run_at.
-- The application layer calculates next_run_at from the cron expression.
CREATE OR REPLACE FUNCTION mark_task_executed(
  p_task_id     TEXT,
  p_success     BOOLEAN,
  p_next_run_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE scheduled_tasks
  SET
    last_run_at = NOW(),
    next_run_at = p_next_run_at
  WHERE id = p_task_id;
$$;

-- Function: purge old completed/failed process records older than N days.
-- Run periodically to keep the processes table from growing unbounded.
CREATE OR REPLACE FUNCTION purge_old_processes(p_older_than_days INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM agent_processes
  WHERE status IN ('completed', 'failed', 'killed')
    AND completed_at < NOW() - (p_older_than_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Function: purge old audit log entries.
CREATE OR REPLACE FUNCTION purge_old_audit_logs(p_older_than_days INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM audit_logs
  WHERE created_at < NOW() - (p_older_than_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Function: get storage usage for an agent (fast path using view).
CREATE OR REPLACE FUNCTION get_agent_storage_bytes(p_agent_id TEXT)
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(total_bytes, 0)
  FROM agent_storage_summary
  WHERE agent_id = p_agent_id;
$$;

-- Revoke public access on all functions in this migration
REVOKE ALL ON FUNCTION get_due_scheduled_tasks(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION mark_task_executed(TEXT, BOOLEAN, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION purge_old_processes(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION purge_old_audit_logs(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_agent_storage_bytes(TEXT) FROM PUBLIC;

-- Grant view access only to service role
REVOKE ALL ON agent_storage_summary FROM PUBLIC;
REVOKE ALL ON agent_process_stats FROM PUBLIC;
