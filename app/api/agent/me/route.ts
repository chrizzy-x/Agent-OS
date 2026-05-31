import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContextWithTier } from '@/src/auth/request';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { isValidTier, normalizePlan, TIER_QUOTAS } from '@/src/auth/tiers';
import { getPlanDescriptor } from '@/src/auth/capabilities';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

/**
 * GET /api/agent/me
 * Returns the authenticated agent's profile including tier and quota limits.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const ctx = await requireAgentContextWithTier(req.headers);
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('agents')
      .select('id, name, tier, metadata, created_at')
      .eq('id', ctx.agentId)
      .maybeSingle();

    if (error) throw new Error(`Failed to load agent: ${error.message}`);

    const metadata = (data?.metadata as Record<string, unknown> | null | undefined) ?? {};
    const tier = isValidTier(metadata.plan) ? normalizePlan(metadata.plan) : normalizePlan(data?.tier ?? ctx.tier);
    const quotas = TIER_QUOTAS[tier];
    const plan = getPlanDescriptor(tier);

    return NextResponse.json({
      name: data?.name ?? null,
      tier,
      plan: plan.plan,
      planLabel: plan.label,
      accountType: plan.enterprise ? 'enterprise' : 'retail',
      capabilities: plan.capabilities,
      quotas,
      createdAt: data?.created_at ?? null,
    });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
  }
}
