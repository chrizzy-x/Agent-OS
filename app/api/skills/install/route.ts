import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { executeAgentOSAction } from '@/src/actions/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const agentCtx = await requireRouteCapability(request.headers, 'skills.install');
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'invalid_json', message: 'Invalid JSON body' }, { status: 400 });
    }

    const { skill_id } = body as { skill_id?: string };
    const slug = typeof body.slug === 'string' ? body.slug : undefined;
    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : undefined;
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : undefined;
    const permissionsApproved = Array.isArray(body.permissionsApproved)
      ? body.permissionsApproved.filter((item): item is string => typeof item === 'string')
      : [];
    const optionalDependencies = Array.isArray(body.optionalDependencies)
      ? body.optionalDependencies.filter((item): item is string => typeof item === 'string')
      : [];
    if (!skill_id && !slug) {
      return NextResponse.json({ error: 'validation_error', message: 'skill_id or slug is required' }, { status: 400 });
    }

    const result = await executeAgentOSAction(agentCtx, {
      action: 'install_skill',
      source: 'manual_ui',
      workspaceId,
      sessionId,
      payload: {
        skillId: skill_id,
        slug,
        permissionsApproved,
        installDependencies: body.installDependencies !== false,
        optionalDependencies,
      },
    });
    const payload = result.result as { success?: boolean; installation?: unknown; skill?: unknown; dependenciesInstalled?: unknown };
    return NextResponse.json({
      success: payload.success === true,
      installation: payload.installation,
      skill: payload.skill,
      dependenciesInstalled: payload.dependenciesInstalled ?? [],
      execution: result.execution,
    }, { status: 201 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
