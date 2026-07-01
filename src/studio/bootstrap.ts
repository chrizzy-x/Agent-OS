import { getSuperAgentProfile } from '../agentos/super-agent.js';
import { reconcileAgentOSProvisioning } from '../agentos/provisioning.js';
import { listInstalledAgentApps } from '../appstore/service.js';
import { listLibrary } from '../library/service.js';
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

async function loadBootstrapWorkflows(ownerAgentId: string): Promise<Array<Record<string, unknown>>> {
  const supabase = getSupabaseAdmin();
  const primary = await supabase
    .from('agent_workflows')
    .select('id,name,summary,status,schedule,graph_state,code_state,canonical_doc,workspace_id,project_id,updated_at')
    .eq('agent_id', ownerAgentId)
    .order('updated_at', { ascending: false });

  if (!primary.error) {
    return (primary.data ?? []) as Array<Record<string, unknown>>;
  }

  if (primary.error.code !== '42703') {
    return [];
  }

  const legacy = await supabase
    .from('agent_workflows')
    .select('id,name,summary,status,schedule,graph_state,code_state,canonical_doc,workspace_id,updated_at')
    .eq('agent_id', ownerAgentId)
    .order('updated_at', { ascending: false });

  if (legacy.error) {
    return [];
  }

  return ((legacy.data ?? []) as Array<Record<string, unknown>>).map(row => ({
    ...row,
    project_id: null,
  }));
}

async function loadBootstrapInstalledSkills(ownerAgentId: string): Promise<Array<Record<string, unknown>>> {
  const result = await getSupabaseAdmin()
    .from('skill_installations')
    .select('id,installed_at,skill:skills(id,name,slug,category,description)')
    .eq('agent_id', ownerAgentId)
    .order('installed_at', { ascending: false });

  if (result.error) {
    return [];
  }

  return (result.data ?? []) as Array<Record<string, unknown>>;
}

export async function buildStudioBootstrap(params: {
  ownerAgentId: string;
  sessionId?: string | null;
  projectId?: string | null;
  workspaceId?: string | null;
  mode?: StudioMode;
}): Promise<Record<string, unknown>> {
  await reconcileAgentOSProvisioning(params.ownerAgentId).catch(() => undefined);

  const [workspaces, sessions] = await Promise.all([
    listWorkspaces(params.ownerAgentId).catch(() => [] as Awaited<ReturnType<typeof listWorkspaces>>),
    listStudioSessions(params.ownerAgentId, { status: 'active' }).catch(() => [] as StudioSessionRecord[]),
  ]);

  const defaultWorkspace = workspaces.find(workspace => workspace.id === params.workspaceId)
    ?? workspaces[0]
    ?? await resolveDefaultWorkspaceForAgent(params.ownerAgentId);
  const scopedSessions = params.workspaceId
    ? sessions.filter(session => session.workspaceId === params.workspaceId)
    : sessions;
  const preferredSession = params.sessionId
    ? scopedSessions.find(session => session.id === params.sessionId) ?? null
    : params.mode === 'nl'
      ? null
      : scopedSessions[0] ?? null;

  let session: StudioSessionRecord | null = preferredSession;
  let draftProjectId: string | null = null;
  if (!session && defaultWorkspace) {
    const project = await resolveProjectForWorkspace({
      ownerAgentId: params.ownerAgentId,
      workspaceId: defaultWorkspace.id,
      projectId: params.projectId ?? null,
    }).catch(() => null);
    if (!project) {
      return {
        mode: params.mode ?? 'nl',
        session: null,
        sessions,
        messages: [],
        events: [],
        lineage: { parent: null, children: [] },
        workspaces,
        projects: [],
        currentProject: null,
        workflows: [],
        vaultSecrets: [],
        installedSkills: [],
        installedApps: [],
        superAgent: null,
        fileTree: [],
        subagents: [],
        memoryEntries: [],
      };
    }
    draftProjectId = project.id;
    if (params.mode === 'nl' && !params.sessionId) {
      session = null;
    } else {
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
          mode: params.mode === 'code' ? 'CODE_STUDIO' : params.mode === 'workflow' ? 'WORKFLOW_STUDIO' : 'NL_STUDIO',
        },
      }).catch(() => null);
      if (session) {
        sessions.unshift(session);
      }
    }
  }

  const activeWorkspaceId = session?.workspaceId ?? defaultWorkspace?.id ?? null;
  const projects = activeWorkspaceId
    ? await listProjects({
      ownerAgentId: params.ownerAgentId,
      workspaceId: activeWorkspaceId,
      status: 'all',
    }).catch(() => [])
    : [];
  const activeProjectId = session?.projectId ?? params.projectId ?? draftProjectId ?? projects[0]?.id ?? null;
  const activeProject = activeProjectId
    ? projects.find(project => project.id === activeProjectId) ?? null
    : null;

  const [bundle, workflows, installedSkills, installedApps, vault, superAgent, fileTree, subagents, memoryEntries, workspaceAssets] = await Promise.all([
    session ? getStudioSessionBundle(params.ownerAgentId, session.id).catch(() => null) : Promise.resolve(null),
    loadBootstrapWorkflows(params.ownerAgentId).catch(() => []),
    loadBootstrapInstalledSkills(params.ownerAgentId).catch(() => []),
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
    listLibrary({
      ownerAgentId: params.ownerAgentId,
      workspaceId: activeWorkspaceId,
      projectId: activeProjectId,
      limit: 120,
    }).catch(() => ({ items: [], groups: {}, summary: {} })),
  ]);

  const filteredWorkflows = workflows
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
    workflows: filteredWorkflows,
    vaultSecrets: vault.secrets ?? [],
    installedSkills,
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
    workspaceAssets: workspaceAssets.items,
  };
}
