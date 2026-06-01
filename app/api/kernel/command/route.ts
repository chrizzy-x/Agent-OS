import { NextRequest, NextResponse } from 'next/server';
import { requireKernelRouteAccess } from '@/src/auth/request';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { executeUniversalToolCall } from '@/src/mcp/registry';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

// POST /api/kernel/command
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireKernelRouteAccess(req.headers, 'command');

    let body: { product?: string; command?: string; payload?: Record<string, unknown> };
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { product, command, payload = {} } = body;
    if (!product || !command) {
      return NextResponse.json({ error: 'product and command are required' }, { status: 400 });
    }

    // Resolve the command topic for this product
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('kernel_registry')
      .select('command_topic, available_commands')
      .eq('agent_id', ctx.agentId)
      .eq('product', product);
    if (ctx.workspaceId) {
      query = query.eq('workspace_id', ctx.workspaceId);
    }
    const primary = await query.single();
    const compat = primary.error && ctx.workspaceId
      ? await supabase
        .from('kernel_registry')
        .select('command_topic, available_commands')
        .eq('agent_id', ctx.agentId)
        .eq('product', product)
        .single()
      : primary;

    if (compat.error || !compat.data) {
      return NextResponse.json({ error: `Product "${product}" not registered` }, { status: 404 });
    }

    const topic = compat.data.command_topic as string;

    // Publish to the command topic via events primitive
    const result = await executeUniversalToolCall({
      agentContext: ctx,
      name: 'agentos.events_publish',
      server: undefined,
      arguments: {
        topic,
        payload: { command, ...payload },
      },
    });

    return NextResponse.json({ dispatched: true, topic, command, result });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
