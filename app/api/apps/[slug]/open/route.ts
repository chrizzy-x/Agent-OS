import { NextRequest, NextResponse } from 'next/server';
import { getAgentAppReadiness, recordAgentAppOpen } from '@/src/appstore/service';
import { requireRouteCapability } from '@/src/auth/request';
import { omitAgentIdentifierFields } from '@/src/auth/display-redaction';
import { toErrorResponse } from '@/src/utils/errors';
import { listWorkspaces } from '@/src/workspaces/service';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'apps.install');
    const { slug } = await params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const target = body.target === 'android' || body.target === 'ios' ? body.target : 'web';
    const viewerWorkspaceIds = (await listWorkspaces(ctx.agentId)).map(workspace => workspace.id);
    const readiness = await getAgentAppReadiness({
      agentId: ctx.agentId,
      slug,
      viewerWorkspaceIds,
    });
    if (!readiness.installation || readiness.installation.status === 'removed') {
      return NextResponse.json({
        code: 'APP_NOT_READY',
        error: 'App must be installed before it can be opened.',
        message: 'App must be installed before it can be opened.',
        ready: false,
      }, { status: 400 });
    }
    if (!readiness.ready) {
      return NextResponse.json({
        code: readiness.missingPermissions.length > 0
          ? 'PERMISSION_REQUIRED'
          : readiness.missingSecrets.length > 0
            ? 'SECRET_REQUIRED'
            : readiness.missingSkills.length > 0
              ? 'SKILL_REQUIRED'
              : 'APP_NOT_READY',
        error: 'App is not ready to open.',
        message: 'App is not ready to open.',
        missingPermissions: readiness.missingPermissions,
        missingSecrets: readiness.missingSecrets,
        missingSkills: readiness.missingSkills,
        ready: false,
      }, { status: 400 });
    }
    const result = await recordAgentAppOpen({ agentId: ctx.agentId, slug, target });
    return NextResponse.json({
      app: omitAgentIdentifierFields(result.app),
      installation: result.installation,
      openUrl: result.openUrl,
      target: result.target,
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
