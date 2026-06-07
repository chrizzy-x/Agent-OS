-- AgentOS Migration 025: V6.4 visibility, permission grants, search, and governed memory/files.

CREATE TABLE IF NOT EXISTS permission_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  permission TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'direct',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ,
  created_by TEXT REFERENCES agents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS permission_grants_source_idx
  ON permission_grants(source_type, source_id, revoked_at);
CREATE INDEX IF NOT EXISTS permission_grants_target_idx
  ON permission_grants(target_type, target_id, revoked_at);
CREATE INDEX IF NOT EXISTS permission_grants_permission_idx
  ON permission_grants(permission, scope, revoked_at);

ALTER TABLE permission_grants ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'permission_grants'
      AND policyname = 'deny_all_permission_grants'
  ) THEN
    CREATE POLICY "deny_all_permission_grants"
      ON permission_grants
      FOR ALL
      USING (FALSE);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS agent_memory_store (
  id BIGSERIAL PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  content TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  namespace_type TEXT NOT NULL DEFAULT 'agent'
    CHECK (namespace_type IN ('user', 'agent', 'subagent', 'workspace', 'workflow', 'app', 'skill')),
  namespace_id TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'workspace', 'public')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE agent_memory_store
  ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS content TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS namespace_type TEXT NOT NULL DEFAULT 'agent',
  ADD COLUMN IF NOT EXISTS namespace_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'agent_memory_store'::regclass
      AND conname = 'agent_memory_store_namespace_type_check'
  ) THEN
    ALTER TABLE agent_memory_store
      ADD CONSTRAINT agent_memory_store_namespace_type_check
      CHECK (namespace_type IN ('user', 'agent', 'subagent', 'workspace', 'workflow', 'app', 'skill'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'agent_memory_store'::regclass
      AND conname = 'agent_memory_store_visibility_check'
  ) THEN
    ALTER TABLE agent_memory_store
      ADD CONSTRAINT agent_memory_store_visibility_check
      CHECK (visibility IN ('private', 'workspace', 'public'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS agent_memory_store_namespace_key_idx
  ON agent_memory_store(agent_id, key, namespace_type, namespace_id);
CREATE INDEX IF NOT EXISTS agent_memory_store_workspace_idx
  ON agent_memory_store(workspace_id, visibility, updated_at DESC);
CREATE INDEX IF NOT EXISTS agent_memory_store_namespace_idx
  ON agent_memory_store(namespace_type, namespace_id, updated_at DESC);

ALTER TABLE agent_memory_store ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_memory_store'
      AND policyname = 'deny_all_agent_memory_store'
  ) THEN
    CREATE POLICY "deny_all_agent_memory_store"
      ON agent_memory_store
      FOR ALL
      USING (FALSE);
  END IF;
END $$;

ALTER TABLE agent_files
  ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS session_id TEXT REFERENCES nl_studio_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS workflow_id UUID REFERENCES agent_workflows(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subagent_id UUID REFERENCES private_subagents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS storage_ref TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'agent_files'::regclass
      AND conname = 'agent_files_visibility_check'
  ) THEN
    ALTER TABLE agent_files
      ADD CONSTRAINT agent_files_visibility_check
      CHECK (visibility IN ('private', 'workspace', 'public'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS agent_files_workspace_visibility_idx
  ON agent_files(workspace_id, visibility, updated_at DESC);
CREATE INDEX IF NOT EXISTS agent_files_session_idx
  ON agent_files(session_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS agent_files_workflow_idx
  ON agent_files(workflow_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS agent_files_subagent_idx
  ON agent_files(subagent_id, updated_at DESC);

ALTER TABLE nl_studio_sessions
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS linked_subagent_id UUID REFERENCES private_subagents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_workflow_id UUID REFERENCES agent_workflows(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_app_id TEXT,
  ADD COLUMN IF NOT EXISTS linked_file_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS linked_memory_refs JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'nl_studio_sessions'::regclass
      AND conname = 'nl_studio_sessions_visibility_check'
  ) THEN
    ALTER TABLE nl_studio_sessions
      ADD CONSTRAINT nl_studio_sessions_visibility_check
      CHECK (visibility IN ('private', 'workspace', 'public'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS nl_studio_sessions_visibility_idx
  ON nl_studio_sessions(owner_agent_id, visibility, updated_at DESC);
CREATE INDEX IF NOT EXISTS nl_studio_sessions_workspace_visibility_idx
  ON nl_studio_sessions(workspace_id, visibility, updated_at DESC);

ALTER TABLE nl_studio_messages
  ADD COLUMN IF NOT EXISTS search_text TEXT NOT NULL DEFAULT '';

UPDATE nl_studio_messages
SET search_text = lower(trim(content))
WHERE search_text = '';

CREATE INDEX IF NOT EXISTS studio_messages_owner_session_idx
  ON nl_studio_messages(owner_agent_id, session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS studio_messages_search_text_idx
  ON nl_studio_messages
  USING GIN (to_tsvector('simple', search_text));

ALTER TABLE private_subagents
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS exposed_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'private_subagents'::regclass
      AND conname = 'private_subagents_visibility_check'
  ) THEN
    ALTER TABLE private_subagents
      ADD CONSTRAINT private_subagents_visibility_check
      CHECK (visibility IN ('private', 'workspace', 'public'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS private_subagents_workspace_visibility_idx
  ON private_subagents(workspace_id, visibility, updated_at DESC);

ALTER TABLE agent_workflows
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'agent_workflows'::regclass
      AND conname = 'agent_workflows_visibility_check'
  ) THEN
    ALTER TABLE agent_workflows
      ADD CONSTRAINT agent_workflows_visibility_check
      CHECK (visibility IN ('private', 'workspace', 'public'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS agent_workflows_visibility_idx
  ON agent_workflows(agent_id, visibility, updated_at DESC);

ALTER TABLE skills
  ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'skills'::regclass
      AND conname = 'skills_visibility_check'
  ) THEN
    ALTER TABLE skills
      ADD CONSTRAINT skills_visibility_check
      CHECK (visibility IN ('private', 'workspace', 'public'));
  END IF;
END $$;

UPDATE skills
SET visibility = CASE WHEN published THEN 'public' ELSE 'private' END;

CREATE INDEX IF NOT EXISTS skills_visibility_idx
  ON skills(author_id, visibility, updated_at DESC);
CREATE INDEX IF NOT EXISTS skills_workspace_visibility_idx
  ON skills(workspace_id, visibility, updated_at DESC);

ALTER TABLE agent_apps DROP CONSTRAINT IF EXISTS agent_apps_visibility_check;
ALTER TABLE agent_apps
  ADD CONSTRAINT agent_apps_visibility_check
  CHECK (visibility IN ('public', 'private', 'workspace', 'unlisted'));
