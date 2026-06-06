import { createClient } from '@supabase/supabase-js';

function requireEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value.startsWith('"') && value.endsWith('"')
        ? value.slice(1, -1)
        : value;
    }
  }
  throw new Error(`Missing required environment variable: ${keys.join(' or ')}`);
}

const supabase = createClient(
  requireEnv('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY'),
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);

const statements = [
  `CREATE TABLE IF NOT EXISTS public.nl_studio_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL REFERENCES public.nl_studio_sessions(id) ON DELETE CASCADE,
    owner_agent_id TEXT NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS public.nl_studio_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL REFERENCES public.nl_studio_sessions(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL,
    owner_agent_id TEXT NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    label TEXT,
    state JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS public.projects (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    owner_agent_id TEXT NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, slug)
  )`,
  `ALTER TABLE public.nl_studio_sessions ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES public.projects(id) ON DELETE SET NULL`,
  `ALTER TABLE public.nl_studio_sessions ADD COLUMN IF NOT EXISTS parent_session_id TEXT REFERENCES public.nl_studio_sessions(id) ON DELETE SET NULL`,
  `ALTER TABLE public.nl_studio_sessions ADD COLUMN IF NOT EXISTS parent_snapshot_id UUID REFERENCES public.nl_studio_snapshots(id) ON DELETE SET NULL`,
  `ALTER TABLE public.nl_studio_sessions ADD COLUMN IF NOT EXISTS branch_label TEXT`,
  `ALTER TABLE public.agent_workflows ADD COLUMN IF NOT EXISTS workspace_id TEXT`,
  `ALTER TABLE public.agent_workflows ADD COLUMN IF NOT EXISTS graph_state JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb`,
  `ALTER TABLE public.agent_workflows ADD COLUMN IF NOT EXISTS code_state TEXT NOT NULL DEFAULT '{ "version": "1.0.0", "nodes": [], "edges": [] }'`,
  `ALTER TABLE public.agent_workflows ADD COLUMN IF NOT EXISTS canonical_doc JSONB NOT NULL DEFAULT '{}'::jsonb`,
  `ALTER TABLE public.agent_workflows ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE public.agent_workflows ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES public.projects(id) ON DELETE SET NULL`,
  `ALTER TABLE public.app_installations ADD COLUMN IF NOT EXISTS installed_version TEXT`,
  `CREATE TABLE IF NOT EXISTS public.agent_app_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id UUID NOT NULL REFERENCES public.agent_apps(id) ON DELETE CASCADE,
    version TEXT NOT NULL,
    change_summary TEXT,
    manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (app_id, version)
  )`,
  `CREATE TABLE IF NOT EXISTS public.private_subagents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id TEXT NOT NULL,
    project_id TEXT REFERENCES public.projects(id) ON DELETE SET NULL,
    owner_agent_id TEXT NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    instructions TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS public.plan_transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    workspace_id TEXT,
    old_plan TEXT NOT NULL,
    new_plan TEXT NOT NULL,
    reason TEXT,
    changed_by TEXT REFERENCES public.agents(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS public.vault_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vault_id TEXT NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL,
    owner_agent_id TEXT NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    encrypted_value TEXT NOT NULL,
    masked_value TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    version INTEGER NOT NULL DEFAULT 1,
    last_accessed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (vault_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS public.vault_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_agent_id TEXT NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL,
    vault_id TEXT NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
    secret_id UUID REFERENCES public.vault_secrets(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS public.vault_secret_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    secret_id UUID NOT NULL REFERENCES public.vault_secrets(id) ON DELETE CASCADE,
    vault_id TEXT NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL,
    owner_agent_id TEXT NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    encrypted_value TEXT NOT NULL,
    masked_value TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (secret_id, version)
  )`,
  `CREATE TABLE IF NOT EXISTS public.vault_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    secret_id UUID NOT NULL REFERENCES public.vault_secrets(id) ON DELETE CASCADE,
    vault_id TEXT NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL,
    owner_agent_id TEXT NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    subject_type TEXT NOT NULL CHECK (subject_type IN ('super_agentos', 'subagent', 'workflow', 'session', 'sdk_credential', 'app', 'skill')),
    subject_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    UNIQUE (secret_id, subject_type, subject_id)
  )`,
  `CREATE TABLE IF NOT EXISTS public.vault_runtime_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    secret_id UUID NOT NULL REFERENCES public.vault_secrets(id) ON DELETE CASCADE,
    vault_id TEXT NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL,
    owner_agent_id TEXT NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    subject_type TEXT NOT NULL CHECK (subject_type IN ('super_agentos', 'subagent', 'workflow', 'session', 'sdk_credential', 'app', 'skill')),
    subject_id TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'consumed', 'cleaned', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    cleaned_up_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS public.trusted_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    fingerprint TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT 'Trusted device',
    user_agent TEXT,
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    UNIQUE (agent_id, fingerprint)
  )`,
  `CREATE TABLE IF NOT EXISTS public.auth_refresh_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    device_id UUID REFERENCES public.trusted_devices(id) ON DELETE SET NULL,
    session_selector TEXT NOT NULL UNIQUE,
    token_hash TEXT NOT NULL,
    user_agent TEXT,
    device_label TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    replaced_by_id UUID REFERENCES public.auth_refresh_sessions(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS public.session_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    session_id UUID REFERENCES public.auth_refresh_sessions(id) ON DELETE SET NULL,
    device_id UUID REFERENCES public.trusted_devices(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS studio_messages_session_idx ON public.nl_studio_messages(session_id, created_at ASC)`,
  `CREATE INDEX IF NOT EXISTS studio_snapshots_session_idx ON public.nl_studio_snapshots(session_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS projects_workspace_idx ON public.projects(workspace_id, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS projects_owner_idx ON public.projects(owner_agent_id, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS studio_sessions_project_idx ON public.nl_studio_sessions(project_id, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_studio_sessions_parent ON public.nl_studio_sessions(parent_session_id, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS agent_workflows_workspace_idx ON public.agent_workflows(workspace_id, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS agent_workflows_canonical_idx ON public.agent_workflows USING GIN (canonical_doc)`,
  `CREATE INDEX IF NOT EXISTS workflows_project_idx ON public.agent_workflows(project_id, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_app_versions_app_created ON public.agent_app_versions(app_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_app_installations_agent_version ON public.app_installations(agent_id, installed_version)`,
  `CREATE INDEX IF NOT EXISTS private_subagents_owner_idx ON public.private_subagents(owner_agent_id, status)`,
  `CREATE INDEX IF NOT EXISTS subagents_project_idx ON public.private_subagents(project_id, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS plan_transitions_agent_idx ON public.plan_transitions(agent_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS vault_secrets_vault_idx ON public.vault_secrets(vault_id, name)`,
  `CREATE INDEX IF NOT EXISTS vault_access_logs_workspace_idx ON public.vault_access_logs(workspace_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS vault_secret_versions_secret_idx ON public.vault_secret_versions(secret_id, version DESC)`,
  `CREATE INDEX IF NOT EXISTS vault_assignments_secret_idx ON public.vault_assignments(secret_id, status)`,
  `CREATE INDEX IF NOT EXISTS vault_runtime_grants_owner_idx ON public.vault_runtime_grants(owner_agent_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS vault_runtime_grants_secret_idx ON public.vault_runtime_grants(secret_id, status, expires_at)`,
  `CREATE INDEX IF NOT EXISTS vault_runtime_grants_subject_idx ON public.vault_runtime_grants(subject_type, subject_id, status)`,
  `CREATE INDEX IF NOT EXISTS trusted_devices_agent_idx ON public.trusted_devices(agent_id, last_seen_at DESC)`,
  `CREATE INDEX IF NOT EXISTS auth_refresh_sessions_agent_idx ON public.auth_refresh_sessions(agent_id, last_seen_at DESC)`,
  `CREATE INDEX IF NOT EXISTS auth_refresh_sessions_selector_idx ON public.auth_refresh_sessions(session_selector)`,
  `CREATE INDEX IF NOT EXISTS session_audit_logs_agent_idx ON public.session_audit_logs(agent_id, created_at DESC)`,
  `ALTER TABLE public.nl_studio_messages ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE public.nl_studio_snapshots ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE public.agent_app_versions ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE public.private_subagents ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE public.plan_transitions ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE public.vault_secrets ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE public.vault_access_logs ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE public.vault_secret_versions ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE public.vault_assignments ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE public.vault_runtime_grants ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE public.auth_refresh_sessions ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE public.session_audit_logs ENABLE ROW LEVEL SECURITY`,
] as const;

async function main() {
  for (const [index, sql] of statements.entries()) {
    const { error } = await supabase.rpc('execute_ddl', {
      p_schema: 'agent_bootstrap',
      p_sql: sql,
    });
    if (error) {
      throw new Error(`Failed statement ${index + 1}/${statements.length}: ${error.message}`);
    }
  }

  console.log(`Reconciled public schema with ${statements.length} additive statements.`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
