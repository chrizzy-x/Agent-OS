import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { installAgentAppToDevice, removeAgentAppFromDevice } from '@/src/appstore/service';
import { runTrackedExecution } from '@/src/execution/service';
import { createNotification } from '@/src/notifications/service';
import { logOperation } from '@/src/runtime/audit';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'apps.install');
    const { slug } = await params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : null;
    const target = typeof body.target === 'string' ? body.target : 'pwa';

    const tracked = await runTrackedExecution({
      agentId: ctx.agentId,
      workspaceId,
      sourceType: 'app',
      type: 'APP_EXECUTION',
      sourceId: slug,
      title: `Install app ${slug} to ${target}`,
      input: { slug, target, workspaceId, offlineCapable: true },
      run: () => installAgentAppToDevice({
        agentId: ctx.agentId,
        slug,
        target,
        workspaceId,
      }),
    });

    await logOperation({
      agentId: ctx.agentId,
      workspaceId,
      executionId: tracked.execution.id,
      sourceType: 'app',
      sourceId: slug,
      primitive: 'action',
      operation: 'app_device_install',
      success: true,
      metadata: {
        target,
        packageCachedForOfflineInstall: tracked.result.packageCachedForOfflineInstall,
        packageRef: tracked.result.packageRef,
      },
    });

    await createNotification({
      agentId: ctx.agentId,
      workspaceId,
      executionId: tracked.execution.id,
      type: 'app_installed',
      title: 'App installed to device',
      body: `${tracked.result.app.name} is installed to ${tracked.result.target}.`,
      metadata: {
        slug,
        target: tracked.result.target,
        packageCachedForOfflineInstall: tracked.result.packageCachedForOfflineInstall,
      },
    }).catch(() => undefined);

    return NextResponse.json({
      ...tracked.result,
      execution: tracked.execution,
    }, { status: 201 });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'apps.install');
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const target = typeof body.target === 'string' ? body.target : searchParams.get('target') ?? 'pwa';
    const result = await removeAgentAppFromDevice({
      agentId: ctx.agentId,
      slug,
      target,
    });
    return NextResponse.json(result);
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
