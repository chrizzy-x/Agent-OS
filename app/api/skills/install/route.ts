import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { verifyAgentToken, extractBearerToken } from '@/src/auth/agent-identity';

export const runtime = 'nodejs';

// POST /api/skills/install - Install a skill for the authenticated agent
export async function POST(request: NextRequest) {
  const token = extractBearerToken(request.headers.get('Authorization') ?? undefined);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let agentCtx;
  try {
    agentCtx = verifyAgentToken(token);
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
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
    .single();

  if (skillErr || !skill) {
    return NextResponse.json({ error: 'Skill not found or not published' }, { status: 404 });
  }

  // Install
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
}
