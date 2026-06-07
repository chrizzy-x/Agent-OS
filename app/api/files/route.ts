import { NextRequest, NextResponse } from 'next/server';
import { createPermissionGrant, listPermissionGrants, revokePermissionGrant } from '@/src/access/service';
import { deleteAgentFile, listAccessibleFiles, upsertAgentFile } from '@/src/files/service';
import { requireRouteCapability } from '@/src/auth/request';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.read');
    const url = new URL(request.url);
    const entries = await listAccessibleFiles({
      viewerAgentId: ctx.agentId,
      workspaceId: url.searchParams.get('workspaceId') ?? undefined,
      sessionId: url.searchParams.get('sessionId') ?? undefined,
      workflowId: url.searchParams.get('workflowId') ?? undefined,
      subagentId: url.searchParams.get('subagentId') ?? undefined,
      search: url.searchParams.get('search') ?? undefined,
      visibility: (url.searchParams.get('visibility') ?? 'all') as 'private' | 'workspace' | 'public' | 'all',
      kind: (url.searchParams.get('kind') ?? 'all') as 'file' | 'artifact' | 'all',
      limit: Number(url.searchParams.get('limit') ?? 100),
    });
    const incomingGrants = await listPermissionGrants({
      actorAgentId: ctx.agentId,
      targetType: 'agent',
      targetId: ctx.agentId,
    }).then(grants => grants.filter(grant => grant.permission === 'file:read')).catch(() => []);
    return NextResponse.json({ entries, incomingGrants });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.update');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const entry = await upsertAgentFile({
      ownerAgentId: ctx.agentId,
      workspaceId: typeof body.workspaceId === 'string' ? body.workspaceId : null,
      sessionId: typeof body.sessionId === 'string' ? body.sessionId : null,
      workflowId: typeof body.workflowId === 'string' ? body.workflowId : null,
      subagentId: typeof body.subagentId === 'string' ? body.subagentId : null,
      path: typeof body.path === 'string' ? body.path : '',
      data: typeof body.data === 'string' ? body.data : undefined,
      contentEncoding: body.contentEncoding === 'utf8' ? 'utf8' : 'base64',
      contentType: typeof body.contentType === 'string' ? body.contentType : null,
      visibility: body.visibility === 'workspace' || body.visibility === 'public' ? body.visibility : 'private',
      kind: body.kind === 'artifact' ? 'artifact' : 'file',
      metadata: body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
        ? body.metadata as Record<string, unknown>
        : undefined,
    });

    if (typeof body.shareTargetAgentId === 'string' && body.shareTargetAgentId.trim()) {
      await createPermissionGrant({
        actorAgentId: ctx.agentId,
        workspaceId: entry.workspaceId,
        sourceType: 'file',
        sourceId: entry.id,
        targetType: 'agent',
        targetId: body.shareTargetAgentId.trim(),
        permission: 'file:read',
      });
    }

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.update');
    const url = new URL(request.url);
    const shareTargetAgentId = url.searchParams.get('shareTargetAgentId');
    if (shareTargetAgentId) {
      const grant = await revokePermissionGrant({
        actorAgentId: ctx.agentId,
        sourceType: 'file',
        sourceId: url.searchParams.get('sourceId') ?? '',
        targetType: 'agent',
        targetId: shareTargetAgentId,
        permission: 'file:read',
      });
      return NextResponse.json({ grant, revoked: true });
    }

    const result = await deleteAgentFile({
      ownerAgentId: ctx.agentId,
      path: url.searchParams.get('path') ?? '',
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
