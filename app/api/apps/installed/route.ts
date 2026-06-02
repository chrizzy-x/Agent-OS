import { NextRequest, NextResponse } from 'next/server';
import { getAgentAppReadiness, listInstalledAgentApps } from '@/src/appstore/service';
import { requireRouteCapability } from '@/src/auth/request';
import { omitAgentIdentifierFields } from '@/src/auth/display-redaction';
import { toErrorResponse } from '@/src/utils/errors';
import { listWorkspaces } from '@/src/workspaces/service';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'apps.install');
    const installed = await listInstalledAgentApps(ctx.agentId);
    const viewerWorkspaceIds = (await listWorkspaces(ctx.agentId)).map(workspace => workspace.id);
    const installedApps = await Promise.all(installed.map(async entry => {
      const readiness = await getAgentAppReadiness({
        agentId: ctx.agentId,
        slug: entry.app.slug,
        workspaceId: entry.installation.workspaceId ?? entry.app.workspaceId ?? undefined,
        viewerWorkspaceIds,
      });
      return {
        ...entry.app,
        installation: entry.installation,
        readiness: {
          requiredPermissions: readiness.requiredPermissions,
          missingPermissions: readiness.missingPermissions,
          missingSecrets: readiness.missingSecrets,
          missingSkills: readiness.missingSkills,
          appUnavailableReason: readiness.appUnavailableReason,
          ready: readiness.ready,
          updateAvailable: readiness.updateAvailable,
          targets: readiness.targets,
        },
      };
    }));
    return NextResponse.json({
      installedApps: omitAgentIdentifierFields(installedApps),
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
