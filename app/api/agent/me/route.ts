import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { isValidTier } from '@/src/auth/tiers';
import { TIER_QUOTAS } from '@/src/auth/tiers';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

/**
 * GET /api/agent/me
 * Returns the authenticated agent's profile including tier and quota limits.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const ctx = requireAgentContext(req.headers);
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('agents')
      .select('id, name, tier, created_at')
      .eq('id', ctx.agentId)
      .maybeSingle();

    if (error) throw new Error(`Failed to load agent: ${error.message}`);

    const tier = data && isValidTier(data.tier) ? data.tier : 'free';
    const quotas = TIER_QUOTAS[tier];

    return NextResponse.json({
      agentId: ctx.agentId,
      name: data?.name ?? null,
      tier,
      quotas,
      createdAt: data?.created_at ?? null,
    });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
  }
}
