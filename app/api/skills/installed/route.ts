import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { requireAgentContext } from '@/src/auth/request';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

// GET /api/skills/installed - List skills installed by the authenticated agent
export async function GET(request: NextRequest) {
  let agentCtx;
  try {
    agentCtx = requireAgentContext(request.headers);
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('skill_installations')
    .select(`
      id,
      installed_at,
      skill:skills(id,name,slug,category,description,icon,pricing_model,price_per_call,capabilities,primitives_required,total_calls,rating,verified)
    `)
    .eq('agent_id', agentCtx.agentId)
    .order('installed_at', { ascending: false });

  if (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
  return NextResponse.json({ installed_skills: data ?? [] });
}
