import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContextWithTier } from '@/src/auth/request';
import { readLocalRuntimeState, updateLocalRuntimeState } from '@/src/storage/local-state';
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
      id: ctx.agentId,
      name: data?.name ?? null,
      email: typeof metadata.email === 'string' ? metadata.email : null,
      username: typeof metadata.username === 'string' ? metadata.username : null,
      bio: typeof metadata.bio === 'string' ? metadata.bio : null,
      website: typeof metadata.website === 'string' ? metadata.website : null,
      preferences: {
        theme: typeof metadata.theme === 'string' ? metadata.theme : 'dark',
        language: typeof metadata.language === 'string' ? metadata.language : 'en',
        timezone: typeof metadata.timezone === 'string' ? metadata.timezone : 'UTC',
        dateFormat: typeof metadata.date_format === 'string' ? metadata.date_format : 'YYYY-MM-DD',
        timeFormat: typeof metadata.time_format === 'string' ? metadata.time_format : '24h',
        compactMode: metadata.compact_mode === true,
        showAdvancedFeatures: metadata.show_advanced_features === true,
        analyticsCrashReports: metadata.analytics_crash_reports !== false,
      },
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

/**
 * PATCH /api/agent/me
 * Updates profile and preference metadata for the authenticated agent.
 */
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const ctx = await requireAgentContextWithTier(req.headers);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 120) : undefined;
    const incomingPreferences = body.preferences && typeof body.preferences === 'object' && !Array.isArray(body.preferences)
      ? body.preferences as Record<string, unknown>
      : {};

    const metadataPatch: Record<string, unknown> = {
      ...(typeof body.email === 'string' ? { email: body.email.trim() } : {}),
      ...(typeof body.username === 'string' ? { username: body.username.trim() } : {}),
      ...(typeof body.bio === 'string' ? { bio: body.bio.trim() } : {}),
      ...(typeof body.website === 'string' ? { website: body.website.trim() } : {}),
      ...(typeof incomingPreferences.theme === 'string' ? { theme: incomingPreferences.theme } : {}),
      ...(typeof incomingPreferences.language === 'string' ? { language: incomingPreferences.language } : {}),
      ...(typeof incomingPreferences.timezone === 'string' ? { timezone: incomingPreferences.timezone } : {}),
      ...(typeof incomingPreferences.dateFormat === 'string' ? { date_format: incomingPreferences.dateFormat } : {}),
      ...(typeof incomingPreferences.timeFormat === 'string' ? { time_format: incomingPreferences.timeFormat } : {}),
      ...(typeof incomingPreferences.compactMode === 'boolean' ? { compact_mode: incomingPreferences.compactMode } : {}),
      ...(typeof incomingPreferences.showAdvancedFeatures === 'boolean' ? { show_advanced_features: incomingPreferences.showAdvancedFeatures } : {}),
      ...(typeof incomingPreferences.analyticsCrashReports === 'boolean' ? { analytics_crash_reports: incomingPreferences.analyticsCrashReports } : {}),
    };

    const supabase = getSupabaseAdmin();
    const { data: current, error: currentError } = await supabase
      .from('agents')
      .select('id,name,metadata,created_at,tier')
      .eq('id', ctx.agentId)
      .maybeSingle();

    if (currentError) throw new Error(`Failed to load agent: ${currentError.message}`);
    if (current) {
      const mergedMetadata = {
        ...((current.metadata as Record<string, unknown> | null | undefined) ?? {}),
        ...metadataPatch,
      };
      const { data, error } = await supabase
        .from('agents')
        .update({
          ...(name ? { name } : {}),
          metadata: mergedMetadata,
        })
        .eq('id', ctx.agentId)
        .select('id,name,tier,metadata,created_at')
        .maybeSingle();

      if (error) throw new Error(`Failed to update agent: ${error.message}`);
      return NextResponse.json({
        updated: true,
        profile: data,
      });
    }

    await updateLocalRuntimeState(state => {
      const account = state.accounts[ctx.agentId];
      if (!account) return;
      if (name) account.agentName = name;
      account.updatedAt = new Date().toISOString();
      account.email = typeof metadataPatch.email === 'string' ? String(metadataPatch.email) : account.email;
    });

    const state = await readLocalRuntimeState();
    const account = state.accounts[ctx.agentId];
    return NextResponse.json({
      updated: true,
      profile: account ? {
        id: account.agentId,
        name: account.agentName,
        metadata: metadataPatch,
      } : null,
    });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
  }
}
