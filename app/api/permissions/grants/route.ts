import { NextRequest, NextResponse } from 'next/server';
import { createPermissionGrant, listPermissionGrants, revokePermissionGrant } from '@/src/access/service';
import { requireRouteCapability } from '@/src/auth/request';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.read');
    const url = new URL(request.url);
    const grants = await listPermissionGrants({
      actorAgentId: ctx.agentId,
      workspaceId: url.searchParams.get('workspaceId'),
      sourceType: url.searchParams.get('sourceType') ?? undefined,
      sourceId: url.searchParams.get('sourceId') ?? undefined,
      targetType: url.searchParams.get('targetType') ?? undefined,
      targetId: url.searchParams.get('targetId') ?? undefined,
      includeRevoked: url.searchParams.get('includeRevoked') === '1',
    });
    return NextResponse.json({ grants });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.update');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const grant = await createPermissionGrant({
      actorAgentId: ctx.agentId,
      workspaceId: typeof body.workspaceId === 'string' ? body.workspaceId : null,
      sourceType: typeof body.sourceType === 'string' ? body.sourceType : '',
      sourceId: typeof body.sourceId === 'string' ? body.sourceId : '',
      targetType: typeof body.targetType === 'string' ? body.targetType : '',
      targetId: typeof body.targetId === 'string' ? body.targetId : '',
      permission: typeof body.permission === 'string' ? body.permission : '',
      scope: typeof body.scope === 'string' ? body.scope : undefined,
      metadata: body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
        ? body.metadata as Record<string, unknown>
        : undefined,
      expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : null,
    });
    return NextResponse.json({ grant }, { status: 201 });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.update');
    const url = new URL(request.url);
    const grant = await revokePermissionGrant({
      actorAgentId: ctx.agentId,
      grantId: url.searchParams.get('grantId') ?? url.searchParams.get('id') ?? undefined,
      workspaceId: url.searchParams.get('workspaceId'),
      sourceType: url.searchParams.get('sourceType') ?? undefined,
      sourceId: url.searchParams.get('sourceId') ?? undefined,
      targetType: url.searchParams.get('targetType') ?? undefined,
      targetId: url.searchParams.get('targetId') ?? undefined,
      permission: url.searchParams.get('permission') ?? undefined,
    });
    return NextResponse.json({ grant, revoked: true });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
