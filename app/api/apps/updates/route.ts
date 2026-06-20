import { NextRequest, NextResponse } from 'next/server';
import { omitAgentIdentifierFields } from '@/src/auth/display-redaction';
import { requireRouteCapability } from '@/src/auth/request';
import { listAppUpdates, updateAllApps } from '@/src/appstore/discovery';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'apps.install');
    const updates = await listAppUpdates(ctx.agentId);
    return NextResponse.json({ updates: omitAgentIdentifierFields(updates), total: updates.length });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'apps.install');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : null;
    const permissionsBySlug = body.permissionsBySlug && typeof body.permissionsBySlug === 'object' && !Array.isArray(body.permissionsBySlug)
      ? body.permissionsBySlug as Record<string, string[]>
      : undefined;
    const updated = await updateAllApps({ agentId: ctx.agentId, workspaceId, permissionsBySlug });
    return NextResponse.json({ updated: omitAgentIdentifierFields(updated), total: updated.length });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
