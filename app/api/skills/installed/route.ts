import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { readLocalRuntimeState } from '@/src/storage/local-state';
import { requireAgentContext } from '@/src/auth/request';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const agentCtx = requireAgentContext(request.headers);

    try {
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

      if (!error) {
        return NextResponse.json({ installed_skills: data ?? [] });
      }
    } catch {
      // Fall back to local state below.
    }

    const state = await readLocalRuntimeState();
    const installed = (state.skills.installations[agentCtx.agentId] ?? [])
      .map(installation => ({
        id: installation.id,
        installed_at: installation.installed_at,
        skill: state.skills.catalog.find(skill => skill.id === installation.skill_id) ?? null,
      }))
      .filter(entry => entry.skill !== null);

    return NextResponse.json({ installed_skills: installed });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message, message: err.message }, { status: err.statusCode });
  }
}
