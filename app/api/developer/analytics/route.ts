import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { requireRouteCapability } from '@/src/auth/request';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

// GET /api/developer/analytics?skill_id=... — usage analytics for a developer's skill
// If no skill_id, returns aggregated across all developer skills
export async function GET(request: NextRequest) {
  try {
    const agentCtx = await requireRouteCapability(request.headers, 'developer.analytics');

    const { searchParams } = new URL(request.url);
    const skillId = searchParams.get('skill_id');
    const days = Math.min(90, Math.max(1, parseInt(searchParams.get('days') || '30')));

    const supabase = getSupabaseAdmin();
    const { data: myApps } = await supabase
      .from('agent_apps')
      .select('id,name,slug,source,runtime_type,install_count,open_count,web_open_count,android_download_count,ios_download_count,heartbeat_count,last_heartbeat_at,last_error,health_status')
      .eq('publisher_id', agentCtx.agentId)
      .order('updated_at', { ascending: false });
    const appIds = (myApps ?? []).map(app => app.id).filter(Boolean);
    const { data: appInstallations } = appIds.length === 0
      ? { data: [] }
      : await supabase
        .from('app_installations')
        .select('agent_id,app_id')
        .in('app_id', appIds);

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

    const since = new Date(Date.now() - days * 86400000).toISOString();
    const rows = skillIds.length === 0
      ? []
      : (await supabase
        .from('skill_usage')
        .select('skill_id, capability_name, success, execution_time_ms, timestamp, cost')
        .in('skill_id', skillIds)
        .gte('timestamp', since)
        .order('timestamp', { ascending: true })).data ?? [];

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

    const apps = (myApps ?? []).map(row => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      source: row.source,
      runtimeType: row.runtime_type,
      installCount: Number(row.install_count ?? 0),
      openCount: Number(row.open_count ?? 0),
      webOpenCount: Number(row.web_open_count ?? 0),
      androidDownloadCount: Number(row.android_download_count ?? 0),
      iosDownloadCount: Number(row.ios_download_count ?? 0),
      heartbeatCount: Number(row.heartbeat_count ?? 0),
      lastHeartbeatAt: typeof row.last_heartbeat_at === 'string' ? row.last_heartbeat_at : null,
      lastError: typeof row.last_error === 'string' ? row.last_error : null,
      healthStatus: typeof row.health_status === 'string' ? row.health_status : 'unknown',
    }));
    const appTotals = apps.reduce((acc, app) => ({
      installs: acc.installs + app.installCount,
      opens: acc.opens + app.openCount,
      downloads: acc.downloads + app.androidDownloadCount + app.iosDownloadCount,
      heartbeats: acc.heartbeats + app.heartbeatCount,
      online: acc.online + (app.healthStatus === 'online' ? 1 : 0),
    }), {
      installs: 0,
      opens: 0,
      downloads: 0,
      heartbeats: 0,
      online: 0,
    });
    const activeUsers = new Set(((appInstallations ?? []) as Array<Record<string, unknown>>).map(row => String(row.agent_id ?? '')).filter(Boolean)).size;
    const totalRevenue = usageByDay.reduce((sum, row) => sum + Number(row.revenue), 0);

    return NextResponse.json({
      skills: mySkills ?? [],
      apps,
      usage_by_day: usageByDay,
      totals: {
        calls: totalCalls,
        errors: totalErrors,
        error_rate: totalCalls > 0 ? ((totalErrors / totalCalls) * 100).toFixed(1) : '0.0',
        avg_ms: msCount > 0 ? Math.round(totalMs / msCount) : 0,
        active_users: activeUsers,
        revenue_usd: Number(totalRevenue.toFixed(4)),
      },
      app_totals: appTotals,
      days,
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
