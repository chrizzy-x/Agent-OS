import { getSuperAgentProfile } from '../agentos/super-agent.js';
import { reconcileAgentOSProvisioning } from '../agentos/provisioning.js';
import { listInstalledAgentApps } from '../appstore/service.js';
import { listAccessibleMemoryEntries } from '../memory/service.js';
import { resolveProjectForWorkspace, listProjects } from '../projects/service.js';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { listStudioSessions, createStudioSession, getStudioSessionBundle } from './persistence.js';
import { listAccessibleSubagents } from '../subagents/service.js';
import { listWorkspaces, resolveDefaultWorkspaceForAgent } from '../workspaces/service.js';
import { listVaultSecrets } from '../vault/service.js';
import { listProjectFiles } from './files.js';
import type { StudioMode } from './types.js';
import type { StudioSessionRecord } from './persistence.js';

export async function buildStudioBootstrap(params: {
  ownerAgentId: string;
  sessionId?: string | null;
  projectId?: string | null;
  mode?: StudioMode;
}): Promise<Record<string, unknown>> {
  await reconcileAgentOSProvisioning(params.ownerAgentId);

  const [workspaces, sessions] = await Promise.all([
    listWorkspaces(params.ownerAgentId),
    listStudioSessions(params.ownerAgentId, { status: 'active' }),
  ]);

  const defaultWorkspace = workspaces[0] ?? await resolveDefaultWorkspaceForAgent(params.ownerAgentId);
  const preferredSession = params.sessionId
    ? sessions.find(session => session.id === params.sessionId) ?? null
    : sessions[0] ?? null;

  let session: StudioSessionRecord | null = preferredSession;
  if (!session && defaultWorkspace) {
    const project = await resolveProjectForWorkspace({
      ownerAgentId: params.ownerAgentId,
      workspaceId: defaultWorkspace.id,
      projectId: params.projectId ?? null,
    });
    const superAgent = await getSuperAgentProfile({
      ownerAgentId: params.ownerAgentId,
      workspaceId: defaultWorkspace.id,
    }).catch(() => null);
    session = await createStudioSession({
      ownerAgentId: params.ownerAgentId,
      workspaceId: defaultWorkspace.id,
      projectId: project.id,
      superAgentId: superAgent?.id ?? null,
      title: project.name === 'Default Project' ? 'New Studio Session' : `${project.name} session`,
      initialState: {
        mode: params.mode === 'code' ? 'CODE_STUDIO' : 'NL_STUDIO',
      },
    });
    sessions.unshift(session);
  }

  const activeWorkspaceId = session?.workspaceId ?? defaultWorkspace?.id ?? null;
  const projects = activeWorkspaceId
    ? await listProjects({
      ownerAgentId: params.ownerAgentId,
      workspaceId: activeWorkspaceId,
      status: 'all',
    })
    : [];
  const activeProjectId = session?.projectId ?? params.projectId ?? projects[0]?.id ?? null;
  const activeProject = activeProjectId
    ? projects.find(project => project.id === activeProjectId) ?? null
    : null;

  const [bundle, workflowsResult, skillsResult, installedApps, vault, superAgent, fileTree, subagents, memoryEntries] = await Promise.all([
    session ? getStudioSessionBundle(params.ownerAgentId, session.id) : Promise.resolve(null),
    getSupabaseAdmin()
      .from('agent_workflows')
      .select('id,name,summary,status,schedule,graph_state,code_state,canonical_doc,workspace_id,project_id,updated_at')
      .eq('agent_id', params.ownerAgentId)
      .order('updated_at', { ascending: false }),
    getSupabaseAdmin()
      .from('skill_installations')
      .select('id,installed_at,skill:skills(id,name,slug,category,description)')
      .eq('agent_id', params.ownerAgentId)
      .order('installed_at', { ascending: false }),
    listInstalledAgentApps(params.ownerAgentId).catch(() => []),
    activeWorkspaceId
      ? listVaultSecrets({ ownerAgentId: params.ownerAgentId, workspaceId: activeWorkspaceId }).catch(() => ({ secrets: [] }))
      : Promise.resolve({ secrets: [] }),
    activeWorkspaceId
      ? getSuperAgentProfile({ ownerAgentId: params.ownerAgentId, workspaceId: activeWorkspaceId }).catch(() => null)
      : Promise.resolve(null),
    activeProjectId
      ? listProjectFiles({ ownerAgentId: params.ownerAgentId, projectId: activeProjectId }).catch(() => [])
      : Promise.resolve([]),
    listAccessibleSubagents({
      viewerAgentId: params.ownerAgentId,
      workspaceIds: activeWorkspaceId ? [activeWorkspaceId] : undefined,
      workspaceId: activeWorkspaceId,
      projectId: activeProjectId,
    }).catch(() => []),
    listAccessibleMemoryEntries({
      viewerAgentId: params.ownerAgentId,
      workspaceId: activeWorkspaceId ?? undefined,
      limit: 24,
    }).catch(() => []),
  ]);

  const workflows = ((workflowsResult.data ?? []) as Array<Record<string, unknown>>)
    .filter(row => !activeWorkspaceId || String(row.workspace_id ?? '') === activeWorkspaceId)
    .filter(row => !activeProjectId || !row.project_id || String(row.project_id ?? '') === activeProjectId)
    .map(row => ({
      id: String(row.id),
      name: String(row.name ?? 'Workflow'),
      summary: typeof row.summary === 'string' ? row.summary : null,
      status: String(row.status ?? 'active'),
      schedule: typeof row.schedule === 'string' ? row.schedule : null,
      graph_state: row.graph_state && typeof row.graph_state === 'object' ? row.graph_state : undefined,
      code_state: typeof row.code_state === 'string' ? row.code_state : null,
      canonical_doc: row.canonical_doc && typeof row.canonical_doc === 'object' ? row.canonical_doc : undefined,
    }));

  return {
    mode: params.mode ?? 'nl',
    session: bundle?.session ?? session,
    sessions,
    messages: bundle?.messages ?? [],
    events: bundle?.events ?? [],
    lineage: bundle?.lineage ?? { parent: null, children: [] },
    workspaces,
    projects,
    currentProject: activeProject,
    workflows,
    vaultSecrets: vault.secrets ?? [],
    installedSkills: skillsResult.data ?? [],
    installedApps: installedApps.map(entry => ({
      id: entry.app.id,
      name: entry.app.name,
      slug: entry.app.slug,
      description: entry.app.description,
      healthStatus: entry.app.healthStatus,
    })),
    superAgent,
    fileTree,
    subagents,
    memoryEntries,
  };
}
