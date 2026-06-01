import { NextRequest, NextResponse } from 'next/server';
import { requireKernelRouteAccess } from '@/src/auth/request';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { executeUniversalToolCall } from '@/src/mcp/registry';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

// GET /api/kernel/status/:product
export async function GET(req: NextRequest, { params }: { params: Promise<{ product: string }> }) {
  try {
    const ctx = await requireKernelRouteAccess(req.headers, 'read');
    const { product } = await params;

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('kernel_registry')
      .select('status_topic, available_commands, status, health_status, endpoint_status, registered_at, last_heartbeat_at, last_status_payload, last_command_at, last_error, version, disabled')
      .eq('agent_id', ctx.agentId)
      .eq('product', product);
    if (ctx.workspaceId) {
      query = query.eq('workspace_id', ctx.workspaceId);
    }
    const { data: kernel, error } = await query.single();

    if (error || !kernel) {
      return NextResponse.json({ error: `Product "${product}" not registered` }, { status: 404 });
    }

    // Pull latest status event from the status topic
    let latestStatus: unknown = null;
    try {
      latestStatus = await executeUniversalToolCall({
        agentContext: ctx,
        name: 'agentos.events_subscribe',
        server: undefined,
        arguments: { topic: kernel.status_topic, limit: 1 },
      });
    } catch {
      // No events yet — product may not have emitted a heartbeat
    }

    return NextResponse.json({
      product,
      status: kernel.status,
      healthStatus: kernel.health_status ?? kernel.status,
      endpointStatus: kernel.endpoint_status ?? 'unknown',
      version: kernel.version ?? null,
      disabled: kernel.disabled === true,
      statusTopic: kernel.status_topic,
      availableCommands: kernel.available_commands ?? [],
      registeredAt: kernel.registered_at,
      lastHeartbeatAt: kernel.last_heartbeat_at ?? null,
      lastCommandAt: kernel.last_command_at ?? null,
      lastError: kernel.last_error ?? null,
      lastStatusPayload: kernel.last_status_payload ?? null,
      latestHeartbeat: latestStatus,
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
