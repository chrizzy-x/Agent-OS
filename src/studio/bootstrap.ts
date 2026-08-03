import { getSuperAgentProfile } from '../agentos/super-agent.js';
import { reconcileAgentOSProvisioning } from '../agentos/provisioning.js';
import { listInstalledAgentApps } from '../appstore/service.js';
import { listLibrary } from '../library/service.js';
import { listAccessibleMemoryEntries } from '../memory/service.js';
import { resolveProjectForWorkspace, listProjects } from '../projects/service.js';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { listStudioSessions, createStudioSession, getStudioSessionBundle } from './persistence.js';
import { getStudioProviderStatus } from './providers.js';
import { buildExecutionTargets, normalizeExecutionTargetId, resolveExecutionTarget } from './execution-targets.js';
import {
  getIntelligenceDefault,
  getStudioSessionIntelligence,
  listIntelligenceConnections,
  type IntelligenceConnectionRecord,
} from '../intelligence/service.js';
import {
  createNativeIntelligenceSelection,
  migrateLegacyExecutionTargetToIntelligenceSelection,
  type IntelligenceSelection,
  type LegacyIntelligenceConnectionMap,
} from '../intelligence/selection.js';
import { listAccessibleSubagents } from '../subagents/service.js';
import { allowLocalDataFallback } from '../data/discipline.js';
import { listWorkspaces, resolveDefaultWorkspaceForAgent } from '../workspaces/service.js';
import { listVaultSecrets } from '../vault/service.js';
import { listProjectFiles } from './files.js';
import { studioModeInitialState } from './modes.js';
import { buildStudioSyncContract } from './sync-contract.js';
import type { StudioMode } from './types.js';
import type { StudioSessionRecord } from './persistence.js';
import { readLocalRuntimeState } from '../storage/local-state.js';

function safeIntelligenceConnection(connection: IntelligenceConnectionRecord): Omit<IntelligenceConnectionRecord, 'vaultSecretId'> {
  return {
    id: connection.id,
    ownerAgentId: connection.ownerAgentId,
    workspaceId: connection.workspaceId,
    vendor: connection.vendor,
    displayName: connection.displayName,
    status: connection.status,
    selectedModelId: connection.selectedModelId,
    availableModels: connection.availableModels,
    capabilities: connection.capabilities,
    health: connection.health,
    lastValidatedAt: connection.lastValidatedAt,
    lastError: connection.lastError,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

function activeConnectionsByVendor(connections: IntelligenceConnectionRecord[]): LegacyIntelligenceConnectionMap {
  return connections
    .filter(connection => connection.status === 'active')
    .reduce<LegacyIntelligenceConnectionMap>((acc, connection) => {
      acc[connection.vendor] ??= {
        connectionId: connection.id,
        modelId: connection.selectedModelId,
      };
      return acc;
    }, {});
}

const BOOTSTRAP_OPTION_TIMEOUT_MS = 8000;
const BOOTSTRAP_PROVISIONING_TIMEOUT_MS = 5000;

function withBootstrapTimeout<T>(
  promise: Promise<T>,
  fallback: T,
  timeoutMs = BOOTSTRAP_OPTION_TIMEOUT_MS,
): Promise<T> {
  return new Promise(resolve => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallback);
    }, timeoutMs);
    promise.then(
      value => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

function selectionUsable(selection: IntelligenceSelection, connections: IntelligenceConnectionRecord[]): boolean {
  if (selection.mode !== 'single') return true;
  return connections.some(connection =>
    connection.id === selection.connectionId
    && connection.status === 'active'
    && connection.availableModels.includes(selection.modelId ?? connection.selectedModelId)
  );
}

async function loadBootstrapWorkflows(ownerAgentId: string): Promise<Array<Record<string, unknown>>> {
  const supabase = getSupabaseAdmin();
  const primary = await supabase
    .from('agent_workflows')
    .select('id,name,summary,status,schedule,steps,graph_state,code_state,canonical_doc,workspace_id,project_id,updated_at')
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
    .select('id,name,summary,status,schedule,steps,graph_state,code_state,canonical_doc,workspace_id,updated_at')
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
    if (!allowLocalDataFallback('AGENTOS_ALLOW_LOCAL_SKILL_FALLBACK')) return [];
    const state = await readLocalRuntimeState();
    const installed: Array<Record<string, unknown>> = [];
    for (const installation of state.skills.installations[ownerAgentId] ?? []) {
      if (installation.status === 'removed' || installation.status === 'disabled') continue;
      const skill = state.skills.catalog.find(item => item.id === installation.skill_id);
      if (!skill) continue;
      installed.push({
          id: installation.id,
          workspace_id: installation.workspace_id ?? null,
          status: installation.status ?? 'active',
          permissions_approved: installation.permissions_approved ?? [],
          dependency_install: installation.dependency_install === true,
          installed_at: installation.installed_at,
          updated_at: installation.updated_at ?? installation.installed_at,
          skill: {
            id: skill.id,
            name: skill.name,
            slug: skill.slug,
            category: skill.category,
            description: skill.description,
          },
      });
    }
    return installed;
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
  await withBootstrapTimeout(
    reconcileAgentOSProvisioning(params.ownerAgentId),
    null,
    BOOTSTRAP_PROVISIONING_TIMEOUT_MS,
  );
  const providerStatus = getStudioProviderStatus();

  const [workspaces, sessions] = await Promise.all([
    withBootstrapTimeout(
      listWorkspaces(params.ownerAgentId),
      [] as Awaited<ReturnType<typeof listWorkspaces>>,
    ),
    withBootstrapTimeout(
      listStudioSessions(params.ownerAgentId, { status: 'active', limit: 60 }),
      [] as StudioSessionRecord[],
    ),
  ]);

  const defaultWorkspace = workspaces.find(workspace => workspace.id === params.workspaceId)
    ?? workspaces[0]
    ?? await withBootstrapTimeout<Awaited<ReturnType<typeof resolveDefaultWorkspaceForAgent>> | null>(
      resolveDefaultWorkspaceForAgent(params.ownerAgentId),
      null,
    );
  const scopedSessions = params.workspaceId
    ? sessions.filter(session => session.workspaceId === params.workspaceId)
    : sessions;
  const preferredSession = params.sessionId
    ? scopedSessions.find(session => session.id === params.sessionId) ?? null
    : params.mode === 'nl'
      ? null
      : scopedSessions[0] ?? null;

  let session: StudioSessionRecord | null = preferredSession;
  const requestedSessionBundle = params.sessionId && !session
    ? await withBootstrapTimeout<Awaited<ReturnType<typeof getStudioSessionBundle>> | null>(
      getStudioSessionBundle(params.ownerAgentId, params.sessionId).catch(() => null),
      null,
    )
    : null;
  if (requestedSessionBundle?.session) {
    session = requestedSessionBundle.session;
    if (!sessions.some(item => item.id === requestedSessionBundle.session.id)) {
      sessions.unshift(requestedSessionBundle.session);
    }
  }
  let draftProjectId: string | null = null;
  if (!session && defaultWorkspace && !params.sessionId) {
    const project = await withBootstrapTimeout<Awaited<ReturnType<typeof resolveProjectForWorkspace>> | null>(
      resolveProjectForWorkspace({
        ownerAgentId: params.ownerAgentId,
        workspaceId: defaultWorkspace.id,
        projectId: params.projectId ?? null,
      }),
      null,
    );
    if (!project) {
      return {
        syncContract: buildStudioSyncContract(),
        mode: params.mode ?? 'nl',
        providerStatus,
        executionTargets: buildExecutionTargets(),
        sessionExecutionTargetId: 'super_agentos',
        intelligenceConnections: [],
        sessionIntelligenceSelection: createNativeIntelligenceSelection('native_default'),
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
      const superAgent = await withBootstrapTimeout<Awaited<ReturnType<typeof getSuperAgentProfile>> | null>(
        getSuperAgentProfile({
          ownerAgentId: params.ownerAgentId,
          workspaceId: defaultWorkspace.id,
        }),
        null,
      );
      session = await withBootstrapTimeout<StudioSessionRecord | null>(
        createStudioSession({
          ownerAgentId: params.ownerAgentId,
          workspaceId: defaultWorkspace.id,
          projectId: project.id,
          superAgentId: superAgent?.id ?? null,
          title: project.name === 'Default Project' ? 'New Studio Session' : `${project.name} session`,
          initialState: {
            mode: studioModeInitialState(params.mode ?? 'nl'),
          },
        }),
        null,
      );
      if (session) {
        sessions.unshift(session);
      }
    }
  }

  const activeWorkspaceId = session?.workspaceId ?? defaultWorkspace?.id ?? null;
  const projects = activeWorkspaceId
    ? await withBootstrapTimeout(
      listProjects({
        ownerAgentId: params.ownerAgentId,
        workspaceId: activeWorkspaceId,
        status: 'all',
      }),
      [] as Awaited<ReturnType<typeof listProjects>>,
    )
    : [];
  const activeProjectId = session?.projectId ?? params.projectId ?? draftProjectId ?? projects[0]?.id ?? null;
  const activeProject = activeProjectId
    ? projects.find(project => project.id === activeProjectId) ?? null
    : null;

  const bundlePromise = requestedSessionBundle?.session.id === session?.id
    ? Promise.resolve(requestedSessionBundle)
    : session
      ? withBootstrapTimeout<Awaited<ReturnType<typeof getStudioSessionBundle>> | null>(
        getStudioSessionBundle(params.ownerAgentId, session.id),
        null,
      )
      : Promise.resolve(null);

  const [bundle, workflows, installedSkills, installedApps, vault, superAgent, fileTree, subagents, memoryEntries, workspaceAssets, intelligenceConnections, workspaceDefault] = await Promise.all([
    bundlePromise,
    withBootstrapTimeout(loadBootstrapWorkflows(params.ownerAgentId), []),
    withBootstrapTimeout(loadBootstrapInstalledSkills(params.ownerAgentId), []),
    withBootstrapTimeout(listInstalledAgentApps(params.ownerAgentId), []),
    activeWorkspaceId
      ? withBootstrapTimeout(
        listVaultSecrets({ ownerAgentId: params.ownerAgentId, workspaceId: activeWorkspaceId }),
        { vaultId: '', workspaceId: activeWorkspaceId, secrets: [] } as Awaited<ReturnType<typeof listVaultSecrets>>,
      )
      : Promise.resolve({ vaultId: '', workspaceId: '', secrets: [] } as Awaited<ReturnType<typeof listVaultSecrets>>),
    activeWorkspaceId
      ? withBootstrapTimeout<Awaited<ReturnType<typeof getSuperAgentProfile>> | null>(
        getSuperAgentProfile({ ownerAgentId: params.ownerAgentId, workspaceId: activeWorkspaceId }),
        null,
      )
      : Promise.resolve(null),
    activeProjectId
      ? withBootstrapTimeout(listProjectFiles({ ownerAgentId: params.ownerAgentId, projectId: activeProjectId }), [])
      : Promise.resolve([]),
    withBootstrapTimeout(listAccessibleSubagents({
      viewerAgentId: params.ownerAgentId,
      workspaceIds: activeWorkspaceId ? [activeWorkspaceId] : undefined,
      workspaceId: activeWorkspaceId,
      projectId: activeProjectId,
    }), []),
    withBootstrapTimeout(listAccessibleMemoryEntries({
      viewerAgentId: params.ownerAgentId,
      workspaceId: activeWorkspaceId ?? undefined,
      limit: 24,
    }), []),
    withBootstrapTimeout(listLibrary({
      ownerAgentId: params.ownerAgentId,
      workspaceId: activeWorkspaceId,
      projectId: activeProjectId,
      limit: 120,
    }), { items: [], groups: {}, summary: {} } as unknown as Awaited<ReturnType<typeof listLibrary>>),
    activeWorkspaceId
      ? withBootstrapTimeout(
        listIntelligenceConnections({
          ownerAgentId: params.ownerAgentId,
          workspaceId: activeWorkspaceId,
        }),
        [] as IntelligenceConnectionRecord[],
      )
      : Promise.resolve([] as IntelligenceConnectionRecord[]),
    activeWorkspaceId
      ? withBootstrapTimeout<Awaited<ReturnType<typeof getIntelligenceDefault>> | null>(
        getIntelligenceDefault({
          ownerAgentId: params.ownerAgentId,
          workspaceId: activeWorkspaceId,
          scope: 'workspace',
        }),
        null,
      )
      : Promise.resolve(null),
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
      project_id: typeof row.project_id === 'string' ? row.project_id : null,
      steps: Array.isArray(row.steps) ? row.steps : [],
      graph_state: row.graph_state && typeof row.graph_state === 'object' ? row.graph_state : undefined,
      code_state: typeof row.code_state === 'string' ? row.code_state : null,
      canonical_doc: row.canonical_doc && typeof row.canonical_doc === 'object' ? row.canonical_doc : undefined,
    }));

  const activeSessionState = bundle?.session?.state ?? session?.state ?? {};
  const executionTargets = buildExecutionTargets({ vaultSecrets: vault.secrets ?? [] });
  const connectionsByVendor = activeConnectionsByVendor(intelligenceConnections);
  const nativeSelection = createNativeIntelligenceSelection('native_default');
  const resolvedSessionSelection = session
    ? (await getStudioSessionIntelligence({
      ownerAgentId: params.ownerAgentId,
      sessionId: session.id,
      connectionsByVendor,
    }).catch(() => ({
      selection: migrateLegacyExecutionTargetToIntelligenceSelection(
        activeSessionState.executionTargetId ?? activeSessionState.provider ?? activeSessionState.executionMode,
        { selectionSource: 'session', connectionsByVendor },
      ),
    }))).selection
    : workspaceDefault?.selection ?? nativeSelection;
  const sessionIntelligenceSelection = selectionUsable(resolvedSessionSelection, intelligenceConnections)
    ? resolvedSessionSelection
    : nativeSelection;
  const sessionExecutionTarget = resolveExecutionTarget(
    executionTargets,
    normalizeExecutionTargetId(activeSessionState.executionTargetId ?? activeSessionState.provider ?? activeSessionState.executionMode),
  );

  return {
    syncContract: buildStudioSyncContract(),
    mode: params.mode ?? 'nl',
    providerStatus,
    executionTargets,
    sessionExecutionTargetId: sessionExecutionTarget.id,
    intelligenceConnections: intelligenceConnections.map(safeIntelligenceConnection),
    sessionIntelligenceSelection,
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
