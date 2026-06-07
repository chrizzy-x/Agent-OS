import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { createPermissionGrant, listPermissionGrants, revokePermissionGrant } from '@/src/access/service';
import { deleteMemoryEntry, listAccessibleMemoryEntries, upsertMemoryEntry } from '@/src/memory/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.read');
    const url = new URL(request.url);
    const search = url.searchParams.get('search') ?? '';
    const namespaceType = url.searchParams.get('namespaceType') ?? undefined;
    const namespaceId = url.searchParams.get('namespaceId') ?? undefined;
    const workspaceId = url.searchParams.get('workspaceId') ?? undefined;
    const visibility = (url.searchParams.get('visibility') ?? 'all') as 'private' | 'workspace' | 'public' | 'all';
    const limit = Number(url.searchParams.get('limit') ?? 100);
    const entries = await listAccessibleMemoryEntries({
      viewerAgentId: ctx.agentId,
      workspaceId,
      namespaceType: namespaceType as 'user' | 'agent' | 'subagent' | 'workspace' | 'workflow' | 'app' | 'skill' | undefined,
      namespaceId,
      search,
      visibility,
      limit,
    });

    const incomingGrants = await listPermissionGrants({
      actorAgentId: ctx.agentId,
      targetType: 'agent',
      targetId: ctx.agentId,
    }).catch(() => []);

    return NextResponse.json({ entries, incomingGrants });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.update');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const key = typeof body.key === 'string' ? body.key : '';
    const content = typeof body.content === 'string' ? body.content : '';
    const tags = Array.isArray(body.tags) ? body.tags.filter((item): item is string => typeof item === 'string') : [];
    const namespaceType = typeof body.namespaceType === 'string' ? body.namespaceType : 'agent';
    const namespaceId = typeof body.namespaceId === 'string' ? body.namespaceId : undefined;
    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : undefined;
    const visibility = body.visibility === 'workspace' || body.visibility === 'public' ? body.visibility : 'private';

    const entry = await upsertMemoryEntry({
      ownerAgentId: ctx.agentId,
      key,
      content,
      tags,
      namespaceType: namespaceType as 'user' | 'agent' | 'subagent' | 'workspace' | 'workflow' | 'app' | 'skill',
      namespaceId,
      workspaceId,
      visibility,
      metadata: body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
        ? body.metadata as Record<string, unknown>
        : undefined,
    });

    if (typeof body.shareTargetAgentId === 'string' && body.shareTargetAgentId.trim()) {
      await createPermissionGrant({
        actorAgentId: ctx.agentId,
        workspaceId: entry.workspaceId,
        sourceType: 'memory',
        sourceId: entry.id,
        targetType: 'agent',
        targetId: body.shareTargetAgentId.trim(),
        permission: 'memory:read',
      });
    }

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.update');
    const url = new URL(request.url);
    const key = url.searchParams.get('key') ?? '';
    const namespaceType = url.searchParams.get('namespaceType') ?? 'agent';
    const namespaceId = url.searchParams.get('namespaceId') ?? undefined;
    const deleteShareTarget = url.searchParams.get('shareTargetAgentId');

    if (deleteShareTarget) {
      const grant = await revokePermissionGrant({
        actorAgentId: ctx.agentId,
        sourceType: 'memory',
        sourceId: url.searchParams.get('sourceId') ?? '',
        targetType: 'agent',
        targetId: deleteShareTarget,
        permission: 'memory:read',
      });
      return NextResponse.json({ grant, revoked: true });
    }

    const result = await deleteMemoryEntry({
      ownerAgentId: ctx.agentId,
      key,
      namespaceType: namespaceType as 'user' | 'agent' | 'subagent' | 'workspace' | 'workflow' | 'app' | 'skill',
      namespaceId,
    });
    return NextResponse.json(result);
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
