import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { requireAgentContext } from '@/src/auth/request';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

// DELETE /api/skills/uninstall - Uninstall a skill
export async function DELETE(request: NextRequest) {
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
  const { error } = await supabase
    .from('skill_installations')
    .delete()
    .eq('agent_id', agentCtx.agentId)
    .eq('skill_id', skill_id);

  if (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }

  // Decrement install count (best-effort)
  await supabase.rpc('decrement_skill_installs', { skill_id });

  return NextResponse.json({ success: true });
}
