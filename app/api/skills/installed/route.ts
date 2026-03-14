import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { verifyAgentToken, extractBearerToken } from '@/src/auth/agent-identity';

export const runtime = 'nodejs';

// GET /api/skills/installed - List skills installed by the authenticated agent
export async function GET(request: NextRequest) {
  const token = extractBearerToken(request.headers.get('Authorization') ?? undefined);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let agentCtx;
  try {
    agentCtx = verifyAgentToken(token);
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ installed_skills: data ?? [] });
}
