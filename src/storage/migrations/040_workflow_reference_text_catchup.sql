-- AgentOS Migration 040: workflow reference catch-up for prefixed Primeflow ids.
-- Additive/compatibility migration. Some older production columns kept UUID workflow references,
-- while AgentOS now uses text ids such as wf_<uuid>.

DO $$
DECLARE
  constraint_record RECORD;
BEGIN
  FOR constraint_record IN
    SELECT tc.table_name, tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND (
        (tc.table_name = 'scheduled_tasks' AND kcu.column_name = 'workflow_id')
        OR (tc.table_name = 'agent_files' AND kcu.column_name = 'workflow_id')
        OR (tc.table_name = 'nl_studio_sessions' AND kcu.column_name = 'linked_workflow_id')
      )
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', constraint_record.table_name, constraint_record.constraint_name);
  END LOOP;
END $$;

ALTER TABLE scheduled_tasks
  ALTER COLUMN workflow_id TYPE TEXT USING workflow_id::text;

ALTER TABLE agent_files
  ALTER COLUMN workflow_id TYPE TEXT USING workflow_id::text;

ALTER TABLE nl_studio_sessions
  ALTER COLUMN linked_workflow_id TYPE TEXT USING linked_workflow_id::text;

CREATE INDEX IF NOT EXISTS scheduled_tasks_workflow_id_idx
  ON scheduled_tasks(workflow_id);
CREATE INDEX IF NOT EXISTS agent_files_workflow_idx
  ON agent_files(workflow_id, updated_at DESC);

NOTIFY pgrst, 'reload schema';

-- ROLLBACK:
-- Existing wf_<uuid> references cannot be losslessly cast back to UUID. To roll back code,
-- keep these columns as TEXT or first migrate prefixed ids to plain UUID values.
