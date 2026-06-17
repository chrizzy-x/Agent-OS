import { NextRequest, NextResponse } from 'next/server';
import { hasAdminAccess, requireRouteCapability } from '@/src/auth/request';
import { getAgentAppReadiness } from '@/src/appstore/service';
import { executeAgentOSAction } from '@/src/actions/service';
import { appendStudioEvent } from '@/src/studio/persistence';
import { assertWorkspaceMembership, listWorkspaces } from '@/src/workspaces/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'apps.install');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const slug = typeof body.slug === 'string' ? body.slug : '';
    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : null;
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : undefined;
    const permissionsApproved = Array.isArray(body.permissionsApproved)
      ? body.permissionsApproved.filter((item): item is string => typeof item === 'string')
      : [];
    if (!slug.trim()) {
      return NextResponse.json({ code: 'VALIDATION_ERROR', error: 'slug is required', message: 'slug is required' }, { status: 400 });
    }
    if (workspaceId) {
      await assertWorkspaceMembership(workspaceId, ctx.agentId);
    }
    const viewerWorkspaceIds = (await listWorkspaces(ctx.agentId)).map(workspace => workspace.id);
    const readiness = await getAgentAppReadiness({
      agentId: ctx.agentId,
      slug,
      workspaceId,
      viewerWorkspaceIds,
      canManageAll: hasAdminAccess(request.headers),
      permissionsApproved,
    });
    if (readiness.appUnavailableReason) {
      return NextResponse.json({
        code: 'APP_UNAVAILABLE',
        error: readiness.appUnavailableReason,
        message: readiness.appUnavailableReason,
        appUnavailableReason: readiness.appUnavailableReason,
      }, { status: 409 });
    }
    if (readiness.missingSecrets.length > 0) {
      if (sessionId) {
        await appendStudioEvent({
          ownerAgentId: ctx.agentId,
          sessionId,
          type: 'secret_required',
          payload: { appSlug: slug, missing: readiness.missingSecrets },
        });
      }
      return NextResponse.json({
        code: 'SECRET_REQUIRED',
        error: 'Required secrets are missing for this app.',
        message: 'Required secrets are missing for this app.',
        missingSecrets: readiness.missingSecrets,
      }, { status: 400 });
    }
    if (readiness.missingSkills.length > 0) {
      return NextResponse.json({
        code: 'SKILL_REQUIRED',
        error: 'Required skills are missing for this app.',
        message: 'Required skills are missing for this app.',
        missingSkills: readiness.missingSkills,
      }, { status: 400 });
    }
    if (readiness.missingPermissions.length > 0) {
      return NextResponse.json({
        code: 'PERMISSION_REQUIRED',
        error: 'Permission approval is required before installing this app.',
        message: 'Permission approval is required before installing this app.',
        requiredPermissions: readiness.requiredPermissions,
        missingPermissions: readiness.missingPermissions,
      }, { status: 400 });
    }

    const actionResult = await executeAgentOSAction(ctx, {
      action: 'install_app',
      source: 'manual_ui',
      workspaceId,
      sessionId,
      canManageAll: hasAdminAccess(request.headers),
      payload: {
        slug,
        permissionsApproved,
      },
    });
    const result = actionResult.result as { app: { slug: string; name: string }; installation: unknown };
    if (sessionId) {
      await appendStudioEvent({
        ownerAgentId: ctx.agentId,
        sessionId,
        type: 'app_installed',
        payload: { appSlug: result.app.slug, appName: result.app.name },
      });
    }
    return NextResponse.json({
      ...result,
      readiness: {
        requiredPermissions: readiness.requiredPermissions,
        missingPermissions: [],
        missingSecrets: [],
        missingSkills: [],
        appUnavailableReason: null,
        ready: true,
        updateAvailable: false,
        targets: readiness.targets,
      },
      execution: actionResult.execution,
    }, { status: 201 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
