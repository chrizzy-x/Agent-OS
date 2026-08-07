import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireRouteCapability } from '@/src/auth/request';
import { resolveProjectForWorkspace } from '@/src/projects/service';
import { reconcileAgentOSProvisioning } from '@/src/agentos/provisioning';
import { setStudioSessionIntelligence } from '@/src/intelligence/service';
import {
  createNativeIntelligenceSelection,
  migrateLegacyExecutionTargetToIntelligenceSelection,
  normalizeIntelligenceSelection,
} from '@/src/intelligence/selection';
import { createStudioSession, listStudioSessions } from '@/src/studio/persistence';
import type { StudioSessionRecord } from '@/src/studio/persistence';
import { buildStudioSyncContract } from '@/src/studio/sync-contract';
import { resolveDefaultWorkspaceForAgent } from '@/src/workspaces/service';
import { getSupabaseServiceRoleKey, getSupabaseUrl } from '@/src/config/env';
import { redactSecretsDeep } from '@/src/security/secret-redaction';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

const STUDIO_SESSION_REST_TIMEOUT_MS = 1_500;
const STUDIO_SESSION_REST_ATTEMPTS = 1;
const STUDIO_SESSION_REST_RETRY_DELAY_MS = 250;

class StudioSessionRestError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'StudioSessionRestError';
  }
}

function sanitizedInitialState(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const next = { ...(value as Record<string, unknown>) };
  delete next.executionTargetId;
  delete next.provider;
  delete next.executionMode;
  return next;
}

function serviceRoleHeaders(extra?: HeadersInit): HeadersInit {
  const serviceRoleKey = getSupabaseServiceRoleKey();
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    ...extra,
  };
}

function restUrl(table: string, params: Record<string, string> = {}): URL {
  const url = new URL(`${getSupabaseUrl().replace(/\/+$/, '')}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

function waitForStudioSessionRestRetry(attempt: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, STUDIO_SESSION_REST_RETRY_DELAY_MS * attempt));
}

async function withStudioSessionRestRetry(
  operation: () => Promise<Array<Record<string, unknown>> | null>,
): Promise<Array<Record<string, unknown>> | null> {
  for (let attempt = 1; attempt <= STUDIO_SESSION_REST_ATTEMPTS; attempt += 1) {
    const rows = await operation();
    if (rows) return rows;
    if (attempt < STUDIO_SESSION_REST_ATTEMPTS) {
      await waitForStudioSessionRestRetry(attempt);
    }
  }
  return null;
}

async function restRows(table: string, params: Record<string, string>): Promise<Array<Record<string, unknown>> | null> {
  return withStudioSessionRestRetry(async () => {
    try {
      const timeout = (globalThis.AbortSignal as typeof AbortSignal & { timeout?: (ms: number) => AbortSignal }).timeout;
      const response = await fetch(restUrl(table, params), {
        headers: serviceRoleHeaders(),
        signal: typeof timeout === 'function' ? timeout(STUDIO_SESSION_REST_TIMEOUT_MS) : undefined,
      });
      if (!response.ok) return null;
      const rows = await response.json().catch(() => null) as unknown;
      return Array.isArray(rows) ? rows as Array<Record<string, unknown>> : null;
    } catch {
      return null;
    }
  });
}

async function restWriteRows(
  table: string,
  body: Record<string, unknown>,
  params: Record<string, string> = {},
  prefer = 'return=representation',
): Promise<Array<Record<string, unknown>> | null> {
  return withStudioSessionRestRetry(async () => {
    try {
      const timeout = (globalThis.AbortSignal as typeof AbortSignal & { timeout?: (ms: number) => AbortSignal }).timeout;
      const response = await fetch(restUrl(table, params), {
        method: 'POST',
        headers: serviceRoleHeaders({
          'Content-Type': 'application/json',
          Prefer: prefer,
        }),
        body: JSON.stringify(body),
        signal: typeof timeout === 'function' ? timeout(STUDIO_SESSION_REST_TIMEOUT_MS) : undefined,
      });
      if (!response.ok) return null;
      const rows = await response.json().catch(() => null) as unknown;
      return Array.isArray(rows) ? rows as Array<Record<string, unknown>> : null;
    } catch {
      return null;
    }
  });
}

function mapRestSession(row: Record<string, unknown>): StudioSessionRecord {
  const state = row.state && typeof row.state === 'object' && !Array.isArray(row.state)
    ? row.state as Record<string, unknown>
    : {};
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    projectId: typeof row.project_id === 'string' ? row.project_id : null,
    ownerAgentId: String(row.owner_agent_id),
    superAgentId: typeof row.super_agent_id === 'string' ? row.super_agent_id : null,
    visibility: row.visibility === 'workspace' || row.visibility === 'public' ? row.visibility : 'private',
    parentSessionId: typeof row.parent_session_id === 'string' ? row.parent_session_id : null,
    parentSnapshotId: typeof row.parent_snapshot_id === 'string' ? row.parent_snapshot_id : null,
    branchLabel: typeof row.branch_label === 'string' ? row.branch_label : null,
    linkedSubagentId: typeof row.linked_subagent_id === 'string' ? row.linked_subagent_id : null,
    linkedWorkflowId: typeof row.linked_workflow_id === 'string' ? row.linked_workflow_id : null,
    linkedAppId: typeof row.linked_app_id === 'string' ? row.linked_app_id : null,
    linkedFilePaths: Array.isArray(row.linked_file_paths) ? row.linked_file_paths.filter((item): item is string => typeof item === 'string') : [],
    linkedMemoryRefs: Array.isArray(row.linked_memory_refs) ? row.linked_memory_refs.filter((item): item is string => typeof item === 'string') : [],
    title: typeof row.title === 'string' ? row.title : 'AgentOS Studio',
    status: typeof row.status === 'string' ? row.status : 'active',
    pinnedAt: typeof row.pinned_at === 'string' ? row.pinned_at : null,
    archivedAt: typeof row.archived_at === 'string' ? row.archived_at : null,
    deletedAt: typeof row.deleted_at === 'string' ? row.deleted_at : null,
    state,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

function defaultProjectRow(ownerAgentId: string, workspaceId: string, now: string): Record<string, unknown> {
  return {
    id: `project_${workspaceId.replace(/[^a-zA-Z0-9_-]/g, '_')}_default`,
    workspace_id: workspaceId,
    owner_agent_id: ownerAgentId,
    name: 'Default Project',
    slug: 'default',
    description: 'Default project for this workspace',
    status: 'active',
    metadata: { system: true },
    created_at: now,
    updated_at: now,
  };
}

async function resolveRestProjectId(params: {
  workspaceOwnerId: string;
  workspaceId: string;
  projectId: string | null;
  now: string;
}): Promise<string | null> {
  if (params.projectId) {
    const projects = await restRows('projects', {
      select: 'id,workspace_id',
      id: `eq.${params.projectId}`,
      workspace_id: `eq.${params.workspaceId}`,
      limit: '1',
    });
    if (!projects) return null;
    if (projects.length === 0) throw new StudioSessionRestError(400, 'project_workspace_mismatch', 'Project does not belong to the selected workspace');
    return String(projects[0].id);
  }

  const projects = await restRows('projects', {
    select: 'id,workspace_id',
    workspace_id: `eq.${params.workspaceId}`,
    status: 'eq.active',
    order: 'updated_at.desc',
    limit: '1',
  });
  if (!projects) return null;
  if (projects[0]?.id) return String(projects[0].id);

  const defaultProject = defaultProjectRow(params.workspaceOwnerId, params.workspaceId, params.now);
  const created = await restWriteRows('projects', defaultProject, { on_conflict: 'id' }, 'resolution=merge-duplicates,return=representation');
  return created?.[0]?.id ? String(created[0].id) : null;
}

async function resolveRestWorkspaceOwnerId(workspaceId: string): Promise<string | null> {
  const rows = await restRows('workspaces', {
    select: 'owner_id',
    id: `eq.${workspaceId}`,
    limit: '1',
  });
  if (!rows) return null;
  return rows[0]?.owner_id ? String(rows[0].owner_id) : null;
}

async function assertRestIntelligenceSelection(params: {
  ownerAgentId: string;
  workspaceId: string;
  selection: ReturnType<typeof normalizeIntelligenceSelection>;
}): Promise<boolean> {
  if (params.selection.mode !== 'single') return true;
  if (!params.selection.connectionId || !params.selection.modelId) {
    throw new StudioSessionRestError(400, 'invalid_intelligence_selection', 'A connected intelligence selection requires a connection and model');
  }
  const rows = await restRows('intelligence_connections', {
    select: 'id',
    id: `eq.${params.selection.connectionId}`,
    owner_agent_id: `eq.${params.ownerAgentId}`,
    workspace_id: `eq.${params.workspaceId}`,
    status: 'eq.active',
    limit: '1',
  });
  if (!rows) return false;
  if (rows.length === 0) throw new StudioSessionRestError(403, 'intelligence_connection_denied', 'Selected intelligence connection is not available');
  return true;
}

async function createStudioSessionViaRest(params: {
  ownerAgentId: string;
  workspaceId: string;
  projectId: string | null;
  title: string | undefined;
  superAgentId: string | null;
  visibility: 'private' | 'workspace' | 'public';
  linkedSubagentId: string | null;
  linkedWorkflowId: string | null;
  linkedAppId: string | null;
  linkedFilePaths?: string[];
  linkedMemoryRefs?: string[];
  initialState: Record<string, unknown> | undefined;
  intelligenceSelection: ReturnType<typeof normalizeIntelligenceSelection>;
}): Promise<StudioSessionRecord | null> {
  const membership = await restRows('workspace_members', {
    select: 'role',
    workspace_id: `eq.${params.workspaceId}`,
    user_id: `eq.${params.ownerAgentId}`,
    limit: '1',
  });
  if (!membership) return null;
  if (membership.length === 0) throw new StudioSessionRestError(403, 'workspace_denied', 'Workspace not found or not accessible');

  const now = new Date().toISOString();
  const workspaceOwnerId = await resolveRestWorkspaceOwnerId(params.workspaceId);
  if (!workspaceOwnerId) return null;
  const projectId = await resolveRestProjectId({
    workspaceOwnerId,
    workspaceId: params.workspaceId,
    projectId: params.projectId,
    now,
  });
  if (!projectId) return null;

  const selectionValid = await assertRestIntelligenceSelection({
    ownerAgentId: params.ownerAgentId,
    workspaceId: params.workspaceId,
    selection: params.intelligenceSelection,
  });
  if (!selectionValid) return null;

  const sessionId = randomUUID();
  const state = redactSecretsDeep({
    ...(params.initialState ?? {}),
    intelligenceSelection: params.intelligenceSelection,
  }) as Record<string, unknown>;
  const row = {
    id: sessionId,
    workspace_id: params.workspaceId,
    project_id: projectId,
    owner_agent_id: params.ownerAgentId,
    super_agent_id: params.superAgentId,
    visibility: params.visibility,
    parent_session_id: null,
    parent_snapshot_id: null,
    branch_label: null,
    linked_subagent_id: params.linkedSubagentId,
    linked_workflow_id: params.linkedWorkflowId,
    linked_app_id: params.linkedAppId,
    linked_file_paths: params.linkedFilePaths ?? [],
    linked_memory_refs: params.linkedMemoryRefs ?? [],
    title: params.title?.trim() || 'New Studio Session',
    status: 'active',
    state,
    intelligence_selection: params.intelligenceSelection,
    pinned_at: null,
    archived_at: null,
    deleted_at: null,
    created_at: now,
    updated_at: now,
  };

  const rows = await restWriteRows('nl_studio_sessions', row);
  if (!rows?.[0]) return null;

  await restWriteRows('studio_session_intelligence', {
    session_id: sessionId,
    owner_agent_id: params.ownerAgentId,
    workspace_id: params.workspaceId,
    mode: params.intelligenceSelection.mode,
    connection_id: params.intelligenceSelection.connectionId,
    model_id: params.intelligenceSelection.modelId,
    consensus_configuration_id: params.intelligenceSelection.consensusConfigurationId,
    selection_source: params.intelligenceSelection.selectionSource,
    created_at: now,
    updated_at: now,
  }, { on_conflict: 'session_id' }, 'resolution=merge-duplicates,return=representation').catch(() => null);

  return mapRestSession(rows[0]);
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.read');
    await reconcileAgentOSProvisioning(ctx.agentId);
    const status = new URL(request.url).searchParams.get('status') ?? undefined;
    const sessions = await listStudioSessions(ctx.agentId, {
      status: status === 'all' ? 'all' : status ?? undefined,
    });
    return NextResponse.json({ syncContract: buildStudioSyncContract(), sessions });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.create');
    let provisioningReconciled = false;
    const reconcileProvisioning = async () => {
      if (provisioningReconciled) return;
      provisioningReconciled = true;
      await reconcileAgentOSProvisioning(ctx.agentId);
    };
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const sanitizedState = sanitizedInitialState(body.initialState);
    const intelligenceSelection = body.intelligenceSelection && typeof body.intelligenceSelection === 'object' && !Array.isArray(body.intelligenceSelection)
      ? normalizeIntelligenceSelection(body.intelligenceSelection, 'session')
      : body.initialState && typeof body.initialState === 'object' && !Array.isArray(body.initialState)
        ? migrateLegacyExecutionTargetToIntelligenceSelection(
          (body.initialState as Record<string, unknown>).executionTargetId
            ?? (body.initialState as Record<string, unknown>).provider
            ?? (body.initialState as Record<string, unknown>).executionMode,
          { selectionSource: 'session' },
        )
        : createNativeIntelligenceSelection('session');
    const requestedWorkspaceId = typeof body.workspaceId === 'string' && body.workspaceId.trim()
      ? body.workspaceId.trim()
      : '';
    let workspaceId = requestedWorkspaceId;
    if (!workspaceId) {
      await reconcileProvisioning();
      workspaceId = (await resolveDefaultWorkspaceForAgent(ctx.agentId))?.id ?? '';
    }
    const requestedProjectId = typeof body.projectId === 'string' ? body.projectId : null;
    if (!workspaceId) {
      return NextResponse.json({ code: 'VALIDATION_ERROR', error: 'workspace_required', message: 'workspaceId is required' }, { status: 400 });
    }

    const directSession = await createStudioSessionViaRest({
      ownerAgentId: ctx.agentId,
      workspaceId,
      projectId: requestedProjectId,
      superAgentId: typeof body.superAgentId === 'string' ? body.superAgentId : null,
      visibility: body.visibility === 'workspace' || body.visibility === 'public' ? body.visibility : 'private',
      linkedSubagentId: typeof body.linkedSubagentId === 'string' ? body.linkedSubagentId : null,
      linkedWorkflowId: typeof body.linkedWorkflowId === 'string' ? body.linkedWorkflowId : null,
      linkedAppId: typeof body.linkedAppId === 'string' ? body.linkedAppId : null,
      linkedFilePaths: Array.isArray(body.linkedFilePaths)
        ? body.linkedFilePaths.filter((item): item is string => typeof item === 'string')
        : undefined,
      linkedMemoryRefs: Array.isArray(body.linkedMemoryRefs)
        ? body.linkedMemoryRefs.filter((item): item is string => typeof item === 'string')
        : undefined,
      title: typeof body.title === 'string' ? body.title : undefined,
      initialState: sanitizedState,
      intelligenceSelection,
    });
    if (directSession) {
      return NextResponse.json({
        syncContract: buildStudioSyncContract(),
        session: directSession,
        intelligenceSelection,
      }, { status: 201 });
    }

    await reconcileProvisioning();
    const project = await resolveProjectForWorkspace({
      ownerAgentId: ctx.agentId,
      workspaceId,
      projectId: requestedProjectId,
    });

    const session = await createStudioSession({
      ownerAgentId: ctx.agentId,
      workspaceId,
      projectId: project.id,
      superAgentId: typeof body.superAgentId === 'string' ? body.superAgentId : null,
      visibility: body.visibility === 'workspace' || body.visibility === 'public' ? body.visibility : 'private',
      linkedSubagentId: typeof body.linkedSubagentId === 'string' ? body.linkedSubagentId : null,
      linkedWorkflowId: typeof body.linkedWorkflowId === 'string' ? body.linkedWorkflowId : null,
      linkedAppId: typeof body.linkedAppId === 'string' ? body.linkedAppId : null,
      linkedFilePaths: Array.isArray(body.linkedFilePaths)
        ? body.linkedFilePaths.filter((item): item is string => typeof item === 'string')
        : undefined,
      linkedMemoryRefs: Array.isArray(body.linkedMemoryRefs)
        ? body.linkedMemoryRefs.filter((item): item is string => typeof item === 'string')
        : undefined,
      title: typeof body.title === 'string' ? body.title : undefined,
      initialState: {
        ...(sanitizedState ?? {}),
        intelligenceSelection,
      },
    });
    const persistedIntelligence = await setStudioSessionIntelligence({
      ownerAgentId: ctx.agentId,
      sessionId: session.id,
      selection: intelligenceSelection,
    });
    return NextResponse.json({
      syncContract: buildStudioSyncContract(),
      session,
      intelligenceSelection: persistedIntelligence.selection,
    }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof StudioSessionRestError) {
      return NextResponse.json(
        { code: error.code, error: error.code, message: error.message },
        { status: error.status },
      );
    }
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
