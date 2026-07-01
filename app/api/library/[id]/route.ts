import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContextWithTier } from '@/src/auth/request';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { updateLocalRuntimeState } from '@/src/storage/local-state';
import { toErrorResponse, NotFoundError } from '@/src/utils/errors';

export const runtime = 'nodejs';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAgentContextWithTier(request.headers);
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.status === 'active' || body.status === 'disabled' || body.status === 'removed') patch.status = body.status;
    if (body.metadata !== undefined) patch.metadata = asRecord(body.metadata);
    try {
      const { data, error } = await getSupabaseAdmin()
        .from('workspace_asset_registry')
        .update(patch)
        .eq('id', id)
        .eq('owner_agent_id', ctx.agentId)
        .select('*')
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new NotFoundError('Library item not found');
      return NextResponse.json({ item: data });
    } catch (error) {
      if (process.env.NODE_ENV === 'production') throw error;
      const item = await updateLocalRuntimeState(state => {
        const index = state.workspaceAssetRegistry.findIndex(entry => entry.id === id && entry.ownerAgentId === ctx.agentId);
        if (index < 0) throw new NotFoundError('Library item not found');
        if (patch.status === 'active' || patch.status === 'disabled' || patch.status === 'removed') state.workspaceAssetRegistry[index].status = patch.status;
        if (patch.metadata && typeof patch.metadata === 'object' && !Array.isArray(patch.metadata)) {
          state.workspaceAssetRegistry[index].metadata = patch.metadata as Record<string, unknown>;
        }
        state.workspaceAssetRegistry[index].updatedAt = String(patch.updated_at);
        return state.workspaceAssetRegistry[index];
      });
      return NextResponse.json({ item });
    }
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
