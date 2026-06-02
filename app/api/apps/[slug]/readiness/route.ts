import { NextRequest, NextResponse } from 'next/server';
import { getAgentAppReadiness } from '@/src/appstore/service';
import { hasAdminAccess, requireRouteCapability } from '@/src/auth/request';
import { omitAgentIdentifierFields } from '@/src/auth/display-redaction';
import { toErrorResponse } from '@/src/utils/errors';
import { listWorkspaces } from '@/src/workspaces/service';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'apps.install');
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId')?.trim() || null;
    const viewerWorkspaceIds = (await listWorkspaces(ctx.agentId)).map(workspace => workspace.id);
    const readiness = await getAgentAppReadiness({
      agentId: ctx.agentId,
      slug,
      workspaceId,
      viewerWorkspaceIds,
      canManageAll: hasAdminAccess(request.headers),
    });
    return NextResponse.json({
      app: omitAgentIdentifierFields(readiness.app),
      installation: readiness.installation,
      requiredPermissions: readiness.requiredPermissions,
      missingPermissions: readiness.missingPermissions,
      missingSecrets: readiness.missingSecrets,
      missingSkills: readiness.missingSkills,
      ready: readiness.ready,
      updateAvailable: readiness.updateAvailable,
      targets: readiness.targets,
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
