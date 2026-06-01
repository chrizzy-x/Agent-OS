import { NextRequest, NextResponse } from 'next/server';
import { requireKernelRouteAccess } from '@/src/auth/request';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

// GET /api/kernel/registry
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireKernelRouteAccess(req.headers, 'read');
    const supabase = getSupabaseAdmin();

    let query = supabase
      .from('kernel_registry')
      .select('*')
      .eq('agent_id', ctx.agentId)
      .order('registered_at', { ascending: false });

    if (ctx.workspaceId) {
      query = query.eq('workspace_id', ctx.workspaceId);
    }

    const primary = await query;
    const compat = primary.error && ctx.workspaceId
      ? await supabase
        .from('kernel_registry')
        .select('*')
        .eq('agent_id', ctx.agentId)
        .order('registered_at', { ascending: false })
      : primary;

    if (compat.error) throw compat.error;
    return NextResponse.json({ kernels: compat.data ?? [] });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
