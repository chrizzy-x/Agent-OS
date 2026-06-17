import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { getFfpTempSettings, updateFfpTempSettings } from '@/src/ffp/temp';
import { createNotification } from '@/src/notifications/service';
import { logOperation } from '@/src/runtime/audit';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.read');
    const url = new URL(request.url);
    const settings = await getFfpTempSettings({
      ownerAgentId: ctx.agentId,
      workspaceId: url.searchParams.get('workspaceId'),
    });
    return NextResponse.json(settings);
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.update');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const settings = await updateFfpTempSettings({
      ownerAgentId: ctx.agentId,
      workspaceId: typeof body.workspaceId === 'string' ? body.workspaceId : null,
      enabled: body.enabled === true,
    });
    await logOperation({
      agentId: ctx.agentId,
      workspaceId: settings.workspaceId,
      primitive: 'system',
      operation: 'ffp_temp_toggle',
      success: true,
      metadata: { enabled: settings.enabled, route: settings.route },
    });
    await createNotification({
      agentId: ctx.agentId,
      workspaceId: settings.workspaceId,
      type: 'system',
      title: settings.status,
      body: settings.route,
      metadata: { affectedExecutionTypes: settings.affectedExecutionTypes },
    }).catch(() => undefined);
    return NextResponse.json(settings);
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
