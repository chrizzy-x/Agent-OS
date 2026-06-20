import { NextRequest, NextResponse } from 'next/server';
import { omitAgentIdentifierFields } from '@/src/auth/display-redaction';
import { requireAgentContext } from '@/src/auth/request';
import { listSkillDiscovery } from '@/src/skills/marketplace';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { readLocalRuntimeState } from '@/src/storage/local-state';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

async function installedSlugs(agentId: string): Promise<string[]> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('skill_installations')
      .select('status,skill:skills(slug)')
      .eq('agent_id', agentId);
    if (!error) {
      return ((data ?? []) as Array<{ status?: string; skill?: { slug?: string } | null }>)
        .filter(row => row.status !== 'removed')
        .map(row => row.skill?.slug)
        .filter((slug): slug is string => typeof slug === 'string');
    }
  } catch {
    // Fall through to local state.
  }
  const state = await readLocalRuntimeState();
  return (state.skills.installations[agentId] ?? [])
    .filter(item => item.status !== 'removed')
    .map(item => state.skills.catalog.find(skill => skill.id === item.skill_id)?.slug ?? '')
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    let installed: string[] = [];
    try {
      const ctx = requireAgentContext(request.headers);
      installed = await installedSlugs(ctx.agentId);
    } catch {
      installed = [];
    }
    const discovery = await listSkillDiscovery({
      query: searchParams.get('search'),
      category: searchParams.get('category'),
      installedSlugs: installed,
    });
    return NextResponse.json(omitAgentIdentifierFields(discovery));
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
