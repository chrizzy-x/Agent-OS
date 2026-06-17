'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import {
  ActivityFeed,
  Button,
  Card,
  EmptyState,
  LoadingState,
  MetricCard,
  PageHeader,
  SearchBar,
} from '@/components/os/ui';

type AnalyticsPayload = {
  summary: {
    totalRuns: number;
    successfulRuns: number;
    activeUsers: number;
    installs: number;
    apiCalls: number;
  };
  series: Array<{ date: string; runs: number; installs: number; apiCalls: number; success: number; failed: number }>;
  runsByStatus: Array<{ label: string; value: number }>;
  topApps: Array<{ name: string; runs: number; installs: number }>;
  topWorkflows: Array<{ id: string; name: string; runs: number; status: string }>;
  realtime: Array<{ id: string; label: string; status: string; createdAt: string }>;
  empty: boolean;
};

function isAnalyticsPayload(value: unknown): value is AnalyticsPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<AnalyticsPayload>;
  return Boolean(payload.summary)
    && typeof payload.summary?.totalRuns === 'number'
    && typeof payload.summary?.successfulRuns === 'number'
    && typeof payload.summary?.activeUsers === 'number'
    && typeof payload.summary?.installs === 'number'
    && typeof payload.summary?.apiCalls === 'number'
    && Array.isArray(payload.series)
    && Array.isArray(payload.runsByStatus)
    && Array.isArray(payload.topApps)
    && Array.isArray(payload.topWorkflows)
    && Array.isArray(payload.realtime)
    && typeof payload.empty === 'boolean';
}

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<AnalyticsPayload | null>(null);
  const [range, setRange] = useState('30');
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics?days=${range}`, { cache: 'no-store' });
      const data = await res.json();
      setPayload(res.ok && isAnalyticsPayload(data) ? data : null);
    } catch {
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const normalizedFilter = filter.trim().toLowerCase();
  const topApps = useMemo(
    () => (payload?.topApps ?? []).filter(app => !normalizedFilter || app.name.toLowerCase().includes(normalizedFilter)),
    [normalizedFilter, payload?.topApps],
  );
  const topWorkflows = useMemo(
    () => (payload?.topWorkflows ?? []).filter(item => !normalizedFilter || item.name.toLowerCase().includes(normalizedFilter)),
    [normalizedFilter, payload?.topWorkflows],
  );
  const realtime = useMemo(
    () => (payload?.realtime ?? []).filter(item => !normalizedFilter || item.label.toLowerCase().includes(normalizedFilter)),
    [normalizedFilter, payload?.realtime],
  );

  function exportAnalytics() {
    if (!payload) return;
    const blob = new Blob([JSON.stringify({
      rangeDays: Number(range),
      generatedAt: new Date().toISOString(),
      filter: normalizedFilter || null,
      summary: payload.summary,
      series: payload.series,
      topApps,
      topWorkflows,
      realtime,
    }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `agentos-analytics-${range}d.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/analytics" />
      <WorkspaceShell
        activePath="/analytics"
        aside={(
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 12 }}>Realtime activity</div>
            <ActivityFeed
              items={realtime.map(item => ({
                id: item.id,
                title: item.label,
                status: item.status,
                time: new Date(item.createdAt).toLocaleString(),
              }))}
            />
          </Card>
        )}
      >
        <PageHeader
          eyebrow="Analytics"
          title="Usage and performance"
          subtitle="Runs, installs, API calls, failures, and success rates."
          actions={<Button variant="secondary" onClick={exportAnalytics}>Export</Button>}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '180px minmax(0, 1fr)', gap: 12 }}>
          <SearchBar value={filter} onChange={event => setFilter(event.target.value)} placeholder="Filter app or workflow" />
          <select className="os-select" value={range} onChange={event => setRange(event.target.value)}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>

        {loading ? <LoadingState label="Loading analytics" /> : !payload ? (
          <EmptyState title="Analytics unavailable" body="The analytics endpoint did not return data for this workspace." />
        ) : payload.empty ? (
          <EmptyState title="No production metrics yet" body="Analytics uses real run and usage records. This workspace has not produced enough data yet." />
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
              <MetricCard label="Total runs" value={payload.summary.totalRuns} />
              <MetricCard label="Successful runs" value={payload.summary.successfulRuns} />
              <MetricCard label="Active users" value={payload.summary.activeUsers} />
              <MetricCard label="Installs" value={payload.summary.installs} />
              <MetricCard label="Failed runs" value={payload.runsByStatus.find(item => item.label.toLowerCase() === 'failed')?.value ?? Math.max(0, payload.summary.totalRuns - payload.summary.successfulRuns)} />
              <MetricCard label="API calls" value={payload.summary.apiCalls} />
            </div>

            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Runs over time</div>
              <div style={{ display: 'grid', gap: 10 }}>
                {payload.series.map(point => (
                  <div key={point.date} style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr) 80px', gap: 12, alignItems: 'center' }}>
                    <span className="os-entity-meta">{point.date}</span>
                    <div style={{ height: 10, borderRadius: 999, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, point.runs * 12)}%`, height: '100%', background: 'var(--accent)' }} />
                    </div>
                    <span className="os-entity-meta">{point.runs} runs</span>
                  </div>
                ))}
              </div>
            </Card>

            {normalizedFilter && topApps.length === 0 && topWorkflows.length === 0 && realtime.length === 0 ? (
              <EmptyState title="No filtered analytics matches" body="Try a different app or workflow name." />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                <Card>
                  <div className="os-entity-title" style={{ marginBottom: 12 }}>Top apps by runs</div>
                  <ActivityFeed items={topApps.map((app, index) => ({
                    id: `${app.name}-${index}`,
                    title: app.name,
                    subtitle: `${app.installs} installs`,
                    status: `${app.runs} runs`,
                  }))} />
                </Card>
                <Card>
                  <div className="os-entity-title" style={{ marginBottom: 12 }}>Top workflows by runs</div>
                  <ActivityFeed items={topWorkflows.map(item => ({
                    id: item.id,
                    title: item.name,
                    subtitle: `${item.runs} runs`,
                    status: item.status,
                  }))} />
                </Card>
              </div>
            )}
          </>
        )}
      </WorkspaceShell>
    </div>
  );
}
