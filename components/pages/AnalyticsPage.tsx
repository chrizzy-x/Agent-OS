'use client';

import { useCallback, useEffect, useState } from 'react';
import Nav from '@/components/Nav';
import {
  ActivityFeed,
  AppShell,
  Button,
  Card,
  EmptyState,
  LoadingState,
  MetricCard,
  PageHeader,
  SearchBar,
  SidebarNav,
  SidebarSection,
} from '@/components/os/ui';

type AnalyticsPayload = {
  summary: {
    totalRuns: number;
    successfulRuns: number;
    activeUsers: number;
    installs: number;
    revenueUsd: number;
    apiCalls: number;
  };
  series: Array<{ date: string; runs: number; installs: number; apiCalls: number; success: number; failed: number }>;
  runsByStatus: Array<{ label: string; value: number }>;
  topApps: Array<{ name: string; runs: number; installs: number }>;
  topWorkflows: Array<{ id: string; name: string; runs: number; status: string }>;
  realtime: Array<{ id: string; label: string; status: string; createdAt: string }>;
  empty: boolean;
};

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
      setPayload(data);
    } catch {
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/settings" />
      <AppShell
        sidebar={(
          <SidebarSection title="Analytics">
            <SidebarNav
              items={[
                { href: '/analytics', label: 'Workspace analytics', active: true },
                { href: '/appstore', label: 'Apps' },
                { href: '/workflows', label: 'Workflows' },
                { href: '/developer', label: 'Developer' },
              ]}
            />
          </SidebarSection>
        )}
        aside={(
          <SidebarSection title="Realtime activity">
            <ActivityFeed
              items={(payload?.realtime ?? []).map(item => ({
                id: item.id,
                title: item.label,
                status: item.status,
                time: new Date(item.createdAt).toLocaleString(),
              }))}
            />
          </SidebarSection>
        )}
      >
        <PageHeader
          eyebrow="Analytics"
          title="Usage and performance"
          subtitle="Runs, installs, API calls, revenue, and success rates."
          actions={<Button variant="secondary">Export</Button>}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '180px minmax(0, 1fr)', gap: 12 }}>
          <SearchBar value={filter} onChange={event => setFilter(event.target.value)} placeholder="Filter app or workspace" />
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
              <MetricCard label="Revenue" value={`$${payload.summary.revenueUsd}`} />
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
              <Card>
                <div className="os-entity-title" style={{ marginBottom: 12 }}>Top apps by runs</div>
                <ActivityFeed items={payload.topApps.map((app, index) => ({
                  id: `${app.name}-${index}`,
                  title: app.name,
                  subtitle: `${app.installs} installs`,
                  status: `${app.runs} runs`,
                }))} />
              </Card>
              <Card>
                <div className="os-entity-title" style={{ marginBottom: 12 }}>Top workflows by runs</div>
                <ActivityFeed items={payload.topWorkflows.map(item => ({
                  id: item.id,
                  title: item.name,
                  subtitle: `${item.runs} runs`,
                  status: item.status,
                }))} />
              </Card>
            </div>
          </>
        )}
      </AppShell>
    </div>
  );
}
