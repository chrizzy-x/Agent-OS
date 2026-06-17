import { NextRequest, NextResponse } from 'next/server';
import { executeAgentOSAction } from '@/src/actions/service';
import { requireRouteCapability } from '@/src/auth/request';
import { omitAgentIdentifierFields } from '@/src/auth/display-redaction';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'apps.install');
    const { slug } = await params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const favorite = typeof body.favorite === 'boolean' ? body.favorite : undefined;
    const permissionsApproved = Array.isArray(body.permissionsApproved)
      ? body.permissionsApproved.filter((item): item is string => typeof item === 'string')
      : undefined;
    const status = body.status === 'active' || body.status === 'disabled' || body.status === 'removed'
      ? body.status
      : undefined;
    const actionResult = await executeAgentOSAction(ctx, {
      action: favorite !== undefined && permissionsApproved === undefined && status === undefined ? 'pin_app' : 'update_app',
      source: 'manual_ui',
      payload: {
        slug,
        favorite,
        permissionsApproved,
        status,
      },
    });
    const result = actionResult.result as { app: unknown; installation: unknown };
    return NextResponse.json({
      app: omitAgentIdentifierFields(result.app),
      installation: result.installation,
      execution: actionResult.execution,
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'apps.install');
    const { slug } = await params;
    const actionResult = await executeAgentOSAction(ctx, {
      action: 'uninstall_app',
      source: 'manual_ui',
      payload: {
        slug,
        status: 'removed',
      },
    });
    const result = actionResult.result as { app: unknown; installation: unknown };
    return NextResponse.json({
      removed: true,
      app: omitAgentIdentifierFields(result.app),
      installation: result.installation,
      execution: actionResult.execution,
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
