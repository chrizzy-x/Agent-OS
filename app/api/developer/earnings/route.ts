import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { requireAgentContext } from '@/src/auth/request';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

// GET /api/developer/earnings — earnings summary for authenticated developer
export async function GET(request: NextRequest) {
  try {
    const agentCtx = requireAgentContext(request.headers);

    const supabase = getSupabaseAdmin();

    // Get all skills owned by this developer
    const { data: mySkills, error: skillsErr } = await supabase
      .from('skills')
      .select('id, name, slug, icon')
      .eq('author_id', agentCtx.agentId);

    if (skillsErr) return NextResponse.json({ error: skillsErr.message }, { status: 500 });
    if (!mySkills || mySkills.length === 0) {
      return NextResponse.json({
        this_month: '0.00',
        last_month: '0.00',
        all_time: '0.00',
        per_skill: [],
      });
    }

    const skillIds = mySkills.map(s => s.id);

    // Date ranges
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const lastMonthEnd = thisMonthStart;

    // All-time usage
    const { data: allUsage } = await supabase
      .from('skill_usage')
      .select('skill_id, cost, timestamp')
      .in('skill_id', skillIds)
      .eq('success', true);

    const usage = allUsage ?? [];

    // Calculate totals
    const allTime = usage.reduce((sum, r) => sum + Number(r.cost ?? 0), 0);

    const thisMonthUsage = usage.filter(r => r.timestamp >= thisMonthStart);
    const thisMonth = thisMonthUsage.reduce((sum, r) => sum + Number(r.cost ?? 0), 0);

    const lastMonthUsage = usage.filter(
      r => r.timestamp >= lastMonthStart && r.timestamp < lastMonthEnd
    );
    const lastMonth = lastMonthUsage.reduce((sum, r) => sum + Number(r.cost ?? 0), 0);

    // Per-skill breakdown (all time)
    const perSkillMap: Record<string, { calls: number; revenue: number }> = {};
    for (const r of usage) {
      if (!perSkillMap[r.skill_id]) perSkillMap[r.skill_id] = { calls: 0, revenue: 0 };
      perSkillMap[r.skill_id].calls += 1;
      perSkillMap[r.skill_id].revenue += Number(r.cost ?? 0);
    }

    const perSkill = mySkills.map(skill => ({
      skill_id: skill.id,
      skill_name: skill.name,
      skill_slug: skill.slug,
      icon: skill.icon,
      total_calls: perSkillMap[skill.id]?.calls ?? 0,
      total_revenue: ((perSkillMap[skill.id]?.revenue ?? 0) * 0.7).toFixed(4),
    }));

    return NextResponse.json({
      this_month: (thisMonth * 0.7).toFixed(2),
      last_month: (lastMonth * 0.7).toFixed(2),
      all_time: (allTime * 0.7).toFixed(2),
      revenue_share_pct: 70,
      per_skill: perSkill,
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
