import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ctx = requireAgentContext(request.headers);
    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));

    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('audit_logs')
      .select('primitive, operation, success, duration_ms, error, created_at')
      .eq('agent_id', ctx.agentId)
      .order('created_at', { ascending: false })
      .limit(limit);

    return NextResponse.json({ agentId: ctx.agentId, activity: data ?? [] });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
