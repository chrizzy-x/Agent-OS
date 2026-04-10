import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { executeUniversalToolCall } from '@/src/mcp/registry';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

// GET /api/kernel/status/:product
export async function GET(req: NextRequest, { params }: { params: Promise<{ product: string }> }) {
  try {
    const ctx = requireAgentContext(req.headers);
    const { product } = await params;

    const supabase = getSupabaseAdmin();
    const { data: kernel, error } = await supabase
      .from('kernel_registry')
      .select('status_topic, available_commands, status, registered_at')
      .eq('agent_id', ctx.agentId)
      .eq('product', product)
      .single();

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
      statusTopic: kernel.status_topic,
      availableCommands: kernel.available_commands ?? [],
      registeredAt: kernel.registered_at,
      latestHeartbeat: latestStatus,
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
