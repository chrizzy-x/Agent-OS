import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { requireAgentContext } from '@/src/auth/request';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

// POST /api/skills/install - Install a skill for the authenticated agent
export async function POST(request: NextRequest) {
  let agentCtx;
  try {
    agentCtx = requireAgentContext(request.headers);
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }

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
    .maybeSingle();

  if (skillErr || !skill) {
    return NextResponse.json({ error: 'Skill not found or not published' }, { status: 404 });
  }

  // Install - handle unique constraint idempotently
  const { data, error } = await supabase
    .from('skill_installations')
    .insert({ agent_id: agentCtx.agentId, skill_id })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      // Already installed - return success idempotently
      const { data: existing } = await supabase
        .from('skill_installations')
        .select()
        .eq('agent_id', agentCtx.agentId)
        .eq('skill_id', skill_id)
        .single();
      return NextResponse.json({ success: true, installation: existing }, { status: 200 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Increment install count (best-effort)
  await supabase
    .from('skills')
    .update({ total_installs: (skill.total_installs ?? 0) + 1 })
    .eq('id', skill_id);

  return NextResponse.json({ success: true, installation: data }, { status: 201 });
}
