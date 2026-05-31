import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { listAgentApps } from '@/src/appstore/service';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  try {
    const ctx = requireAgentContext(request.headers);
    const url = new URL(request.url);
    const days = Math.max(1, Math.min(90, Number(url.searchParams.get('days') ?? 30)));
    const since = new Date(Date.now() - ((days - 1) * 86400000));
    const sinceIso = since.toISOString();

    const [workflowsResult, usageResult, apps, installsResult] = await Promise.all([
      getSupabaseAdmin()
        .from('agent_workflows')
        .select('id,name,status,last_run_at,last_error,workspace_id,updated_at,created_at')
        .eq('agent_id', ctx.agentId)
        .order('updated_at', { ascending: false }),
      getSupabaseAdmin()
        .from('skill_usage')
        .select('skill_id,success,execution_time_ms,timestamp,cost')
        .eq('agent_id', ctx.agentId)
        .gte('timestamp', sinceIso)
        .order('timestamp', { ascending: true }),
      listAgentApps({
        viewerAgentId: ctx.agentId,
        includeHidden: true,
      }),
      getSupabaseAdmin()
        .from('skill_installations')
        .select('id,installed_at,skill:skills(name)')
        .eq('agent_id', ctx.agentId)
        .order('installed_at', { ascending: false }),
    ]);

    const workflows = (workflowsResult.data ?? []) as Array<Record<string, unknown>>;
    const usage = (usageResult.data ?? []) as Array<Record<string, unknown>>;
    const installs = (installsResult.data ?? []) as Array<Record<string, unknown>>;

    const daysMap = new Map<string, {
      runs: number;
      installs: number;
      apiCalls: number;
      success: number;
      failed: number;
      revenue: number;
    }>();

    for (let i = 0; i < days; i += 1) {
      const date = new Date(since.getTime() + (i * 86400000));
      daysMap.set(dayKey(date), { runs: 0, installs: 0, apiCalls: 0, success: 0, failed: 0, revenue: 0 });
    }

    for (const row of workflows) {
      const stamp = typeof row.last_run_at === 'string' ? row.last_run_at : typeof row.updated_at === 'string' ? row.updated_at : null;
      if (!stamp) continue;
      const key = dayKey(new Date(stamp));
      const entry = daysMap.get(key);
      if (!entry) continue;
      entry.runs += 1;
      if (typeof row.last_error === 'string' && row.last_error) entry.failed += 1;
      else entry.success += 1;
    }

    for (const row of usage) {
      const key = typeof row.timestamp === 'string' ? row.timestamp.slice(0, 10) : '';
      const entry = daysMap.get(key);
      if (!entry) continue;
      entry.apiCalls += 1;
      entry.revenue += Number(row.cost ?? 0);
    }

    for (const row of installs) {
      const installedAt = typeof row.installed_at === 'string' ? row.installed_at : null;
      if (!installedAt) continue;
      const entry = daysMap.get(installedAt.slice(0, 10));
      if (!entry) continue;
      entry.installs += 1;
    }

    const topApps = apps
      .map(app => ({
        name: app.name,
        slug: app.slug,
        runs: app.installCount,
        installs: app.installCount,
        runtimeType: app.runtimeType,
      }))
      .sort((left, right) => right.runs - left.runs)
      .slice(0, 5);

    const topWorkflows = workflows
      .map(row => ({
        id: String(row.id),
        name: String(row.name ?? 'Workflow'),
        runs: typeof row.last_run_at === 'string' ? 1 : 0,
        status: typeof row.last_error === 'string' && row.last_error ? 'failed' : 'success',
      }))
      .sort((left, right) => right.runs - left.runs)
      .slice(0, 5);

    const totalRuns = [...daysMap.values()].reduce((sum, item) => sum + item.runs, 0);
    const totalSuccess = [...daysMap.values()].reduce((sum, item) => sum + item.success, 0);
    const totalFailed = [...daysMap.values()].reduce((sum, item) => sum + item.failed, 0);
    const totalInstalls = [...daysMap.values()].reduce((sum, item) => sum + item.installs, 0);
    const totalApiCalls = [...daysMap.values()].reduce((sum, item) => sum + item.apiCalls, 0);
    const revenue = [...daysMap.values()].reduce((sum, item) => sum + item.revenue, 0);

    return NextResponse.json({
      summary: {
        totalRuns,
        successfulRuns: totalSuccess,
        activeUsers: installs.length,
        installs: totalInstalls,
        revenueUsd: Number(revenue.toFixed(2)),
        apiCalls: totalApiCalls,
      },
      series: [...daysMap.entries()].map(([date, value]) => ({ date, ...value })),
      runsByStatus: [
        { label: 'Success', value: totalSuccess },
        { label: 'Failed', value: totalFailed },
      ],
      topApps,
      topWorkflows,
      topCountries: [],
      realtime: workflows.slice(0, 10).map(row => ({
        id: String(row.id),
        type: 'workflow',
        label: String(row.name ?? 'Workflow'),
        status: typeof row.last_error === 'string' && row.last_error ? 'error' : 'success',
        createdAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
      })),
      empty: totalRuns === 0 && totalApiCalls === 0 && totalInstalls === 0,
    });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
  }
}
