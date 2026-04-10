import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

// POST /api/kernel/register
export async function POST(req: NextRequest) {
  try {
    const ctx = requireAgentContext(req.headers);

    let body: {
      product?: string;
      commandTopic?: string;
      statusTopic?: string;
      availableCommands?: unknown[];
    };
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { product, commandTopic, statusTopic, availableCommands = [] } = body;
    if (!product || !commandTopic || !statusTopic) {
      return NextResponse.json({ error: 'product, commandTopic, and statusTopic are required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('kernel_registry')
      .upsert({
        agent_id: ctx.agentId,
        product: String(product),
        command_topic: String(commandTopic),
        status_topic: String(statusTopic),
        available_commands: availableCommands,
        status: 'online',
        registered_at: new Date().toISOString(),
      }, { onConflict: 'agent_id,product' })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ registered: true, kernel: data });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
