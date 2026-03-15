import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { requireAgentContext } from '@/src/auth/request';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

// GET /api/developer/analytics?skill_id=... — usage analytics for a developer's skill
// If no skill_id, returns aggregated across all developer skills
export async function GET(request: NextRequest) {
  try {
    const agentCtx = requireAgentContext(request.headers);

    const { searchParams } = new URL(request.url);
    const skillId = searchParams.get('skill_id');
    const days = Math.min(90, Math.max(1, parseInt(searchParams.get('days') || '30')));

    const supabase = getSupabaseAdmin();

    // Verify ownership if skill_id is provided
    if (skillId) {
      const { data: skill } = await supabase
        .from('skills')
        .select('id,author_id')
        .eq('id', skillId)
        .single();

      if (!skill) return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
      if (skill.author_id !== agentCtx.agentId) {
        return NextResponse.json({ error: 'Unauthorized: not your skill' }, { status: 403 });
      }
    }

    // Get skill IDs owned by this developer
    const { data: mySkills } = await supabase
      .from('skills')
      .select('id, name, slug, icon, total_installs, total_calls, rating, review_count')
      .eq('author_id', agentCtx.agentId);

    const skillIds = skillId
      ? [skillId]
      : (mySkills ?? []).map(s => s.id);

    if (skillIds.length === 0) {
      return NextResponse.json({ skills: [], usage_by_day: [], totals: { calls: 0, errors: 0, avg_ms: 0 } });
    }

    // Pull usage from the last N days
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const { data: usageRows } = await supabase
      .from('skill_usage')
      .select('skill_id, capability_name, success, execution_time_ms, timestamp, cost')
      .in('skill_id', skillIds)
      .gte('timestamp', since)
      .order('timestamp', { ascending: true });

    const rows = usageRows ?? [];

    // Aggregate by day
    const byDay: Record<string, { calls: number; errors: number; revenue: number }> = {};
    let totalCalls = 0;
    let totalErrors = 0;
    let totalMs = 0;
    let msCount = 0;

    for (const r of rows) {
      const day = r.timestamp.slice(0, 10); // YYYY-MM-DD
      if (!byDay[day]) byDay[day] = { calls: 0, errors: 0, revenue: 0 };
      byDay[day].calls += 1;
      if (!r.success) byDay[day].errors += 1;
      byDay[day].revenue += Number(r.cost ?? 0) * 0.7;
      totalCalls++;
      if (!r.success) totalErrors++;
      if (r.execution_time_ms) { totalMs += r.execution_time_ms; msCount++; }
    }

    // Fill in all days (even zero-call days) for charts
    const usageByDay = [];
    for (let d = 0; d < days; d++) {
      const dt = new Date(Date.now() - (days - 1 - d) * 86400000).toISOString().slice(0, 10);
      usageByDay.push({
        date: dt,
        calls: byDay[dt]?.calls ?? 0,
        errors: byDay[dt]?.errors ?? 0,
        revenue: (byDay[dt]?.revenue ?? 0).toFixed(4),
      });
    }

    return NextResponse.json({
      skills: mySkills ?? [],
      usage_by_day: usageByDay,
      totals: {
        calls: totalCalls,
        errors: totalErrors,
        error_rate: totalCalls > 0 ? ((totalErrors / totalCalls) * 100).toFixed(1) : '0.0',
        avg_ms: msCount > 0 ? Math.round(totalMs / msCount) : 0,
      },
      days,
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
