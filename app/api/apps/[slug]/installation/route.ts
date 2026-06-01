import { NextRequest, NextResponse } from 'next/server';
import { updateAgentAppInstallation } from '@/src/appstore/service';
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
    const result = await updateAgentAppInstallation({
      agentId: ctx.agentId,
      slug,
      favorite,
      permissionsApproved,
      status,
    });
    return NextResponse.json({
      app: omitAgentIdentifierFields(result.app),
      installation: result.installation,
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
    const result = await updateAgentAppInstallation({
      agentId: ctx.agentId,
      slug,
      status: 'removed',
    });
    return NextResponse.json({
      removed: true,
      app: omitAgentIdentifierFields(result.app),
      installation: result.installation,
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
