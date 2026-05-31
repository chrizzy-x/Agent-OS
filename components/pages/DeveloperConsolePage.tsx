'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Nav from '@/components/Nav';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import {
  ActivityFeed,
  AppShell,
  Button,
  Card,
  DataTable,
  EmptyState,
  FilterChips,
  LoadingState,
  MetricCard,
  PageHeader,
  SearchBar,
  SidebarNav,
  SidebarSection,
  StatusPill,
} from '@/components/os/ui';

type DeveloperAnalytics = {
  totals?: {
    calls?: number;
    error_rate?: string;
  };
  usage_by_day?: Array<{ date: string; calls: number; errors: number; revenue: string }>;
};

type KernelEntry = {
  product: string;
  commandTopic: string;
  statusTopic: string;
  status: string;
  registeredAt: string;
  lastHeartbeatAt?: string | null;
};

type DeveloperApp = {
  id: string;
  name: string;
  slug: string;
  description: string;
  source: string;
  visibility: string;
  runtimeType: string;
  installCount: number;
  lastHeartbeatAt?: string | null;
};

const SECTIONS = ['Overview', 'My Apps', 'SDK Keys', 'Publishing', 'Analytics', 'Webhooks', 'Billing', 'Settings', 'Docs'];

export default function DeveloperConsolePage() {
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [section, setSection] = useState('Overview');
  const [analytics, setAnalytics] = useState<DeveloperAnalytics | null>(null);
  const [registry, setRegistry] = useState<KernelEntry[]>([]);
  const [apps, setApps] = useState<DeveloperApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const canUseDeveloperConsole = session?.capabilities?.includes('access_developer_console') === true;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const current = await fetchBrowserSession().catch(() => null);
      setSession(current);
      if (!current) return;
      const [appsRes, analyticsRes, registryRes] = await Promise.all([
        fetch('/api/apps?mine=1&sort=recent', { cache: 'no-store' }),
        fetch('/api/developer/analytics', { cache: 'no-store' }).catch(() => null),
        fetch('/api/kernel/registry', { cache: 'no-store' }).catch(() => null),
      ]);
      const appsData = await appsRes.json();
      setApps(appsData.apps ?? []);
      if (analyticsRes?.ok) {
        setAnalytics(await analyticsRes.json());
      } else {
        setAnalytics(null);
      }
      if (registryRes?.ok) {
        const registryData = await registryRes.json();
        setRegistry(registryData.registry ?? []);
      } else {
        setRegistry([]);
      }
    } catch {
      setAnalytics(null);
      setRegistry([]);
      setApps([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredApps = useMemo(
    () => apps.filter(app => !search || `${app.name} ${app.description} ${app.slug}`.toLowerCase().includes(search.toLowerCase())),
    [apps, search],
  );

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/developer" />
      <AppShell
        activePath="/developer"
        sidebar={(
          <SidebarSection title="Developer">
            <FilterChips items={SECTIONS} active={section} onChange={setSection} />
            <SidebarNav items={SECTIONS.map(item => ({
              href: item === 'Publishing' ? '/developer/publish' : undefined,
              label: item,
              active: item === section,
              onClick: item === 'Publishing' ? undefined : () => setSection(item),
            }))} />
          </SidebarSection>
        )}
        aside={(
          <>
            <SidebarSection title="SDK health">
              <ActivityFeed
                items={registry.slice(0, 5).map(item => ({
                  id: item.product,
                  title: item.product,
                  subtitle: item.statusTopic,
                  status: item.status,
                  time: item.lastHeartbeatAt ? new Date(item.lastHeartbeatAt).toLocaleString() : 'No heartbeat yet',
                }))}
              />
            </SidebarSection>
            <SidebarSection title="Quick links">
              <SidebarNav
                items={[
                  { href: '/developer/publish', label: 'Publish app' },
                  { href: '/appstore', label: 'View public Appstore' },
                  { href: '/settings/team', label: 'Workspace team' },
                ]}
              />
            </SidebarSection>
          </>
        )}
      >
        <PageHeader
          eyebrow="Developer Console"
          title="Developer Console"
          subtitle="SDK apps, internal apps, publishing, analytics, keys, and webhooks."
          actions={<Button href="/developer/publish">Publish app</Button>}
        />

        {loading ? <LoadingState label="Loading developer console" /> : !session ? (
          <EmptyState title="Sign in required" body="Sign in to manage apps, SDK credentials, and analytics." action={<Button href="/signin">Sign in</Button>} />
        ) : !canUseDeveloperConsole ? (
          <EmptyState title="Enterprise access required" body="Developer Console stays gated to enterprise-capable workspaces. Existing routes remain available, but SDK publishing and analytics are blocked on plan." action={<Button href="/studio">Open Studio</Button>} />
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
              <MetricCard label="Total apps" value={apps.length} />
              <MetricCard label="Installs" value={apps.reduce((sum, app) => sum + app.installCount, 0)} />
              <MetricCard label="Active users" value={analytics?.totals?.calls ?? 0} />
              <MetricCard label="Revenue" value="$0" />
              <MetricCard label="SDK health" value={`${registry.filter(item => item.lastHeartbeatAt).length}/${registry.length}`} />
              <MetricCard label="Heartbeats" value={registry.filter(item => item.lastHeartbeatAt).length} />
              <MetricCard label="API calls" value={analytics?.totals?.calls ?? 0} />
              <MetricCard label="Error rate" value={`${analytics?.totals?.error_rate ?? '0.0'}%`} />
            </div>

            <SearchBar value={search} onChange={event => setSearch(event.target.value)} placeholder="Search apps, registrations, slugs..." />

            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Recent app registrations</div>
              {registry.length === 0 ? (
                <div className="os-empty-body">No SDK registrations yet.</div>
              ) : (
                <DataTable
                  columns={['App', 'Type', 'Registered', 'Status', 'Installs', 'Last heartbeat']}
                  rows={registry.map(item => {
                    const match = apps.find(app => app.slug === item.product || app.name === item.product);
                    return [
                      item.product,
                      match?.source === 'external_sdk' ? 'External SDK' : 'Internal',
                      new Date(item.registeredAt).toLocaleDateString(),
                      <StatusPill key={`${item.product}-status`} status={item.status} />,
                      String(match?.installCount ?? 0),
                      item.lastHeartbeatAt ? new Date(item.lastHeartbeatAt).toLocaleString() : '—',
                    ];
                  })}
                />
              )}
            </Card>

            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>My apps</div>
              {filteredApps.length === 0 ? (
                <EmptyState title="No apps yet" body="SDK apps appear here automatically after registration. Internal apps appear after publishing." action={<Button href="/developer/publish">Publish app</Button>} />
              ) : (
                <DataTable
                  columns={['App', 'Runtime', 'Visibility', 'Installs', 'Heartbeat', 'Open']}
                  rows={filteredApps.map(app => [
                    app.name,
                    app.runtimeType,
                    <StatusPill key={`${app.id}-visibility`} status={app.visibility} />,
                    String(app.installCount),
                    app.lastHeartbeatAt ? new Date(app.lastHeartbeatAt).toLocaleString() : '—',
                    <a key={`${app.id}-open`} href={`/appstore/${app.slug}`} className="btn-outline">Manage</a>,
                  ])}
                />
              )}
            </Card>
          </>
        )}
      </AppShell>
    </div>
  );
}
