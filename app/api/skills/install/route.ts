import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { requireAgentContext } from '@/src/auth/request';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

// POST /api/skills/install - Install a skill for the authenticated agent
export async function POST(request: NextRequest) {
  try {
    const agentCtx = requireAgentContext(request.headers);

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { skill_id } = body as { skill_id?: string };
    if (!skill_id) {
      return NextResponse.json({ error: 'skill_id is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Verify skill exists and is published
    const { data: skill, error: skillErr } = await supabase
      .from('skills')
      .select('id, name, total_installs')
      .eq('id', skill_id)
      .eq('published', true)
      .single();

    if (skillErr || !skill) {
      return NextResponse.json({ error: 'Skill not found or not published' }, { status: 404 });
    }

    // Install; handle unique constraint idempotently
    const { data, error } = await supabase
      .from('skill_installations')
      .insert({ agent_id: agentCtx.agentId, skill_id })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Skill already installed' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Increment install count (best-effort)
    await supabase
      .from('skills')
      .update({ total_installs: (skill.total_installs ?? 0) + 1 })
      .eq('id', skill_id);

    return NextResponse.json({ success: true, installation: data }, { status: 201 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
