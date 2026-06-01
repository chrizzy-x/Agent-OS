import { NextRequest, NextResponse } from 'next/server';
import { requireKernelRouteAccess } from '@/src/auth/request';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { executeUniversalToolCall } from '@/src/mcp/registry';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

async function loadKernelStatusRecord(agentId: string, workspaceId: string | null, product: string) {
  const supabase = getSupabaseAdmin();
  const run = async (selectText: string, includeWorkspace: boolean) => {
    let query = supabase
      .from('kernel_registry')
      .select(selectText)
      .eq('agent_id', agentId)
      .eq('product', product);
    if (includeWorkspace && workspaceId) {
      query = query.eq('workspace_id', workspaceId);
    }
    return query.single();
  };

  const primary = await run(
    'status_topic, available_commands, status, health_status, endpoint_status, registered_at, last_heartbeat_at, last_status_payload, last_command_at, last_error, version, disabled',
    true,
  );
  if (!primary.error && primary.data) return primary;

  const noWorkspacePrimary = workspaceId
    ? await run(
      'status_topic, available_commands, status, health_status, endpoint_status, registered_at, last_heartbeat_at, last_status_payload, last_command_at, last_error, version, disabled',
      false,
    )
    : primary;
  if (!noWorkspacePrimary.error && noWorkspacePrimary.data) return noWorkspacePrimary;

  return run('status_topic, available_commands, status, registered_at, last_heartbeat_at, last_status_payload', false);
}

// GET /api/kernel/status/:product
export async function GET(req: NextRequest, { params }: { params: Promise<{ product: string }> }) {
  try {
    const ctx = await requireKernelRouteAccess(req.headers, 'read');
    const { product } = await params;
    const { data: kernel, error } = await loadKernelStatusRecord(ctx.agentId, ctx.workspaceId, product);

    if (error || !kernel) {
      return NextResponse.json({ error: `Product "${product}" not registered` }, { status: 404 });
    }
    const record = kernel as unknown as Record<string, unknown>;

    let latestStatus: unknown = null;
    try {
      latestStatus = await executeUniversalToolCall({
        agentContext: ctx,
        name: 'agentos.events_subscribe',
        server: undefined,
        arguments: { topic: record.status_topic, limit: 1 },
      });
    } catch {
      // No events yet - product may not have emitted a heartbeat.
    }

    const statusPayload = typeof record.last_status_payload === 'object' && record.last_status_payload
      ? record.last_status_payload as Record<string, unknown>
      : {};

    return NextResponse.json({
      product,
      status: record.status,
      healthStatus: record.health_status ?? record.status ?? statusPayload.status ?? 'unknown',
      endpointStatus: record.endpoint_status ?? statusPayload.endpointStatus ?? 'unknown',
      version: record.version ?? null,
      disabled: record.disabled === true,
      statusTopic: record.status_topic,
      availableCommands: record.available_commands ?? [],
      registeredAt: record.registered_at,
      lastHeartbeatAt: record.last_heartbeat_at ?? null,
      lastCommandAt: record.last_command_at ?? null,
      lastError: record.last_error ?? statusPayload.lastError ?? null,
      lastStatusPayload: record.last_status_payload ?? null,
      latestHeartbeat: latestStatus,
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
