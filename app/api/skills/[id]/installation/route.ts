import { NextRequest, NextResponse } from 'next/server';
import { omitAgentIdentifierFields } from '@/src/auth/display-redaction';
import { requireRouteCapability } from '@/src/auth/request';
import { updateSkillInstallationPermissions } from '@/src/skills/marketplace';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'skills.install');
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const permissionsApproved = Array.isArray(body.permissionsApproved)
      ? body.permissionsApproved.filter((item): item is string => typeof item === 'string')
      : undefined;
    const status = body.status === 'active' || body.status === 'disabled' || body.status === 'removed'
      ? body.status
      : undefined;
    const result = await updateSkillInstallationPermissions({
      agentId: ctx.agentId,
      skillIdOrSlug: id,
      permissionsApproved,
      status,
    });
    return NextResponse.json(omitAgentIdentifierFields(result));
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
