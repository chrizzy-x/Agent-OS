import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

// GET /api/agent/workflows
export async function GET(req: NextRequest) {
  try {
    const ctx = requireAgentContext(req.headers);
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('agent_workflows')
      .select('*')
      .eq('agent_id', ctx.agentId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ workflows: data ?? [] });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}

// POST /api/agent/workflows
export async function POST(req: NextRequest) {
  try {
    const ctx = requireAgentContext(req.headers);

    let body: { name?: string; summary?: string; steps?: unknown[]; schedule?: string | null };
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { name, summary, steps, schedule = null } = body;
    if (!name || !steps || !Array.isArray(steps)) {
      return NextResponse.json({ error: 'name and steps are required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('agent_workflows')
      .insert({
        agent_id: ctx.agentId,
        name: String(name).slice(0, 80),
        summary: summary ?? null,
        steps,
        schedule: schedule ?? null,
        status: 'active',
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ workflow: data }, { status: 201 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
