import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { verifyAgentToken, extractBearerToken } from '@/src/auth/agent-identity';

export const runtime = 'nodejs';

// DELETE /api/skills/uninstall - Uninstall a skill
export async function DELETE(request: NextRequest) {
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
  const { error } = await supabase
    .from('skill_installations')
    .delete()
    .eq('agent_id', agentCtx.agentId)
    .eq('skill_id', skill_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Decrement install count (best-effort)
  await supabase.rpc('decrement_skill_installs', { skill_id });

  return NextResponse.json({ success: true });
}
