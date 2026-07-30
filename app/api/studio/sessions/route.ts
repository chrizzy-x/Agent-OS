import { NextRequest, NextResponse } from 'next/server';
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
import { buildStudioSyncContract } from '@/src/studio/sync-contract';
import { resolveDefaultWorkspaceForAgent } from '@/src/workspaces/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

function sanitizedInitialState(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const next = { ...(value as Record<string, unknown>) };
  delete next.executionTargetId;
  delete next.provider;
  delete next.executionMode;
  return next;
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
    await reconcileAgentOSProvisioning(ctx.agentId);
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
    const workspaceId = typeof body.workspaceId === 'string' && body.workspaceId.trim()
      ? body.workspaceId
      : (await resolveDefaultWorkspaceForAgent(ctx.agentId))?.id ?? '';
    const requestedProjectId = typeof body.projectId === 'string' ? body.projectId : null;
    if (!workspaceId) {
      return NextResponse.json({ code: 'VALIDATION_ERROR', error: 'workspace_required', message: 'workspaceId is required' }, { status: 400 });
    }
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
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
