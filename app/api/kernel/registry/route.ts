import { NextRequest, NextResponse } from 'next/server';
import { getAgentAppByKernelProduct } from '@/src/appstore/service';
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
    const kernels = await Promise.all(((compat.data ?? []) as Array<Record<string, unknown>>).map(async row => {
      const product = String(row.product ?? '');
      const app = product
        ? await getAgentAppByKernelProduct(product, { canManageAll: true })
        : null;
      const discoveryStatus = !app
        ? 'metadata_required'
        : app.disabled
          ? 'disabled'
          : app.visibility === 'public'
            ? 'indexed'
            : 'hidden';

      return {
        ...row,
        app_slug: app?.slug ?? null,
        app_visibility: app?.visibility ?? null,
        discovery_status: discoveryStatus,
        discovery_error: !app
          ? 'SDK metadata must be re-registered with name, description, version, and launch targets before the app can be indexed publicly.'
          : null,
      };
    }));

    return NextResponse.json({ kernels });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
