'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import { Drawer } from '@/components/os/overlays';
import { useRouteDrawer } from '@/components/os/drawer-state';
import { resolveBrowserAccessState } from '@/src/auth/browser-access';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import {
  ActivityFeed,
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  LoadingState,
  MetricCard,
  PageHeader,
  SearchBar,
  StatusPill,
} from '@/components/os/ui';

type DeveloperAnalytics = {
  totals?: {
    calls?: number;
    error_rate?: string;
    active_users?: number;
    revenue_usd?: number;
  };
  app_totals?: {
    installs?: number;
    opens?: number;
    downloads?: number;
    heartbeats?: number;
    online?: number;
  };
};

type KernelEntry = {
  product: string;
  commandTopic: string;
  statusTopic: string;
  status: string;
  registeredAt: string;
  lastHeartbeatAt?: string | null;
  discoveryStatus?: string;
  discoveryError?: string | null;
  appSlug?: string | null;
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
  openCount?: number;
  healthStatus?: string;
  androidDownloadCount?: number;
  iosDownloadCount?: number;
  heartbeatCount?: number;
  lastHeartbeatAt?: string | null;
};

type AppDetail = DeveloperApp & {
  manifest?: {
    version?: string;
    runtime?: string;
    permissions?: string[];
    requiredSecrets?: string[];
    skills?: string[];
    requiredSkills?: string[];
  };
  versionHistory?: Array<{ id: string; version: string; changeSummary: string | null; createdAt: string }>;
  lastError?: string | null;
};

type DrawerId = 'published-app' | 'registry-entry';

function formatDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : 'Not recorded';
}

export default function DeveloperConsolePage() {
  const drawer = useRouteDrawer<DrawerId>();
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [analytics, setAnalytics] = useState<DeveloperAnalytics | null>(null);
  const [registry, setRegistry] = useState<KernelEntry[]>([]);
  const [apps, setApps] = useState<DeveloperApp[]>([]);
  const [detail, setDetail] = useState<AppDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState('');

  const canUseDeveloperConsole = session?.capabilities?.includes('access_developer_console') === true;
  const accessState = resolveBrowserAccessState(session, loading, 'access_developer_console');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const current = await fetchBrowserSession().catch(() => null);
      setSession(current);
      if (!current) {
        setAnalytics(null);
        setRegistry([]);
        setApps([]);
        return;
      }
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
        setRegistry((registryData.kernels ?? registryData.registry ?? []).map((item: Record<string, unknown>) => ({
          product: String(item.product ?? ''),
          commandTopic: String(item.command_topic ?? item.commandTopic ?? ''),
          statusTopic: String(item.status_topic ?? item.statusTopic ?? ''),
          status: String(item.health_status ?? item.status ?? 'unknown'),
          registeredAt: String(item.registered_at ?? item.registeredAt ?? new Date().toISOString()),
          lastHeartbeatAt: typeof (item.last_heartbeat_at ?? item.lastHeartbeatAt) === 'string' ? String(item.last_heartbeat_at ?? item.lastHeartbeatAt) : null,
          discoveryStatus: typeof (item.discovery_status ?? item.discoveryStatus) === 'string' ? String(item.discovery_status ?? item.discoveryStatus) : 'unknown',
          discoveryError: typeof (item.discovery_error ?? item.discoveryError) === 'string' ? String(item.discovery_error ?? item.discoveryError) : null,
          appSlug: typeof (item.app_slug ?? item.appSlug) === 'string' ? String(item.app_slug ?? item.appSlug) : null,
        })));
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

  useEffect(() => {
    if (drawer.current?.id !== 'published-app' || !drawer.current.entityId) {
      setDetail(null);
      return;
    }
    let active = true;
    setDetailLoading(true);
    void fetch(`/api/apps/${encodeURIComponent(drawer.current.entityId)}`, { cache: 'no-store' })
      .then(response => response.json())
      .then(payload => {
        if (active) setDetail(payload.app ?? null);
      })
      .catch(() => {
        if (active) setDetail(null);
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [drawer.current?.entityId, drawer.current?.id]);

  const filteredApps = useMemo(
    () => apps.filter(app => !search || `${app.name} ${app.description} ${app.slug}`.toLowerCase().includes(search.toLowerCase())),
    [apps, search],
  );
  const recoveryEntries = useMemo(
    () => registry.filter(item => item.discoveryStatus === 'metadata_required' || item.discoveryStatus === 'hidden'),
    [registry],
  );
  const selectedRegistry = useMemo(
    () => registry.find(item => item.product === drawer.current?.entityId) ?? null,
    [drawer.current?.entityId, registry],
  );

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/developer" />
      <WorkspaceShell
        activePath="/developer"
        aside={(
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 12 }}>Summary</div>
            <div className="os-drawer-stack">
              <Badge tone={accessState === 'allowed' ? 'accent' : accessState === 'blocked' ? 'warning' : 'default'}>
                {accessState === 'allowed' ? 'Enterprise developer access' : accessState === 'signed_out' ? 'Sign in required' : accessState === 'blocked' ? 'Retail access blocked' : 'Checking access'}
              </Badge>
              <div className="os-entity-copy">Published apps: {apps.length}</div>
              <div className="os-entity-copy">SDK registrations: {registry.length}</div>
              <div className="os-entity-copy">Recovery needed: {recoveryEntries.length}</div>
              <Button href="/developer/publish" variant="secondary">Publish app</Button>
            </div>
          </Card>
        )}
      >
        {accessState === 'allowed' ? (
          <PageHeader
            eyebrow="Developer Console"
            title="Published apps and SDK runtime"
            subtitle="Inspect published apps, SDK registrations, health, installs, manifest coverage, errors, and recovery blockers in drawers."
            actions={<Button href="/sdk">Open SDK</Button>}
          />
        ) : accessState === 'signed_out' ? (
          <PageHeader eyebrow="Developer Access" title="Sign in required" subtitle="Developer Console is available only after sign-in and plan validation." />
        ) : accessState === 'blocked' ? (
          <PageHeader eyebrow="Developer Access" title="Enterprise access required" subtitle="Retail workspaces cannot open publishing, SDK, analytics, or billing controls." />
        ) : (
          <PageHeader eyebrow="Developer Access" title="Checking access" subtitle="Validating developer permissions for this workspace." />
        )}

        {loading ? <LoadingState label="Loading developer console" /> : !session ? (
          <EmptyState title="Sign in required" body="Sign in to manage apps, SDK registrations, and analytics." action={<Button href="/signin">Sign in</Button>} />
        ) : !canUseDeveloperConsole ? (
          <EmptyState title="Enterprise access required" body="Developer Console stays gated to enterprise-capable workspaces." action={<Button href="/studio">Open Studio</Button>} />
        ) : (
          <div className="os-drawer-stack">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
              <MetricCard label="Apps" value={apps.length} />
              <MetricCard label="Installs" value={analytics?.app_totals?.installs ?? apps.reduce((sum, app) => sum + app.installCount, 0)} />
              <MetricCard label="Active users" value={analytics?.totals?.active_users ?? analytics?.app_totals?.opens ?? 0} />
              <MetricCard label="Revenue" value={`$${analytics?.totals?.revenue_usd?.toFixed(2) ?? '0.00'}`} />
              <MetricCard label="Healthy SDK apps" value={analytics?.app_totals?.online ?? registry.filter(item => item.status === 'online').length} />
              <MetricCard label="Error rate" value={`${analytics?.totals?.error_rate ?? '0.0'}%`} />
            </div>

            <SearchBar value={search} onChange={event => setSearch(event.target.value)} placeholder="Search apps and slugs" />

            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Published apps</div>
              {filteredApps.length === 0 ? (
                <EmptyState title="No apps yet" body="Publish an app or register an SDK app to populate this surface." action={<Button href="/developer/publish">Publish app</Button>} />
              ) : (
                <DataTable
                  columns={['App', 'Runtime', 'Visibility', 'Installs', 'Opens', 'Health', 'Actions']}
                  rows={filteredApps.map(app => [
                    app.name,
                    app.runtimeType,
                    <StatusPill key={`${app.id}-visibility`} status={app.visibility} />,
                    String(app.installCount),
                    String(app.openCount ?? 0),
                    <StatusPill key={`${app.id}-health`} status={app.healthStatus ?? 'unknown'} />,
                    <div key={`${app.id}-actions`} className="os-inline-actions">
                      <Button variant="secondary" onClick={() => drawer.openDrawer('published-app', app.slug)}>Inspect</Button>
                      <Button href={`/appstore/${app.slug}`}>Open page</Button>
                    </div>,
                  ])}
                />
              )}
            </Card>

            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>SDK registrations</div>
              {registry.length === 0 ? (
                <div className="os-empty-body">No SDK registrations yet.</div>
              ) : (
                <DataTable
                  columns={['Product', 'Health', 'Discovery', 'Registered', 'Last heartbeat', 'Actions']}
                  rows={registry.map(item => [
                    item.product,
                    <StatusPill key={`${item.product}-status`} status={item.status} />,
                    item.discoveryStatus === 'metadata_required'
                      ? (item.discoveryError ?? 'Metadata required')
                      : item.appSlug
                        ? `Indexed as ${item.appSlug}`
                        : item.discoveryStatus ?? 'unknown',
                    new Date(item.registeredAt).toLocaleDateString(),
                    formatDate(item.lastHeartbeatAt),
                    <Button key={`${item.product}-inspect`} variant="secondary" onClick={() => drawer.openDrawer('registry-entry', item.product)}>Inspect</Button>,
                  ])}
                />
              )}
            </Card>

            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Legacy SDK recovery</div>
              {recoveryEntries.length === 0 ? (
                <div className="os-empty-body">No legacy SDK recovery blockers detected.</div>
              ) : (
                <ActivityFeed items={recoveryEntries.map(item => ({
                  id: item.product,
                  title: item.product,
                  subtitle: item.discoveryError ?? 'Metadata registration is incomplete.',
                  status: item.discoveryStatus ?? 'metadata_required',
                  time: formatDate(item.lastHeartbeatAt ?? item.registeredAt),
                }))} />
              )}
            </Card>
          </div>
        )}
      </WorkspaceShell>

      <Drawer
        open={drawer.current?.id === 'published-app'}
        onClose={drawer.closeDrawer}
        title={detail?.name ?? 'App detail'}
        description="App analytics, manifest coverage, versions, and runtime readiness."
        routeSafe
      >
        {detailLoading ? <LoadingState label="Loading app details" /> : !detail ? (
          <EmptyState title="App unavailable" body="This app detail record could not be loaded." />
        ) : (
          <div className="os-drawer-stack">
            <Card>
              <div className="os-inline-actions">
                <Badge tone="accent">{detail.runtimeType}</Badge>
                <StatusPill status={detail.healthStatus ?? 'unknown'} />
                <StatusPill status={detail.visibility} />
              </div>
              <div className="os-drawer-stack" style={{ marginTop: 12 }}>
                <div className="os-entity-copy">Version: {detail.manifest?.version ?? '1.0.0'}</div>
                <div className="os-entity-copy">Installs: {detail.installCount}</div>
                <div className="os-entity-copy">Opens: {detail.openCount ?? 0}</div>
                <div className="os-entity-copy">Last heartbeat: {formatDate(detail.lastHeartbeatAt)}</div>
                {detail.lastError ? <div className="os-entity-copy">Last error: {detail.lastError}</div> : null}
              </div>
            </Card>
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Manifest</div>
              <div className="os-drawer-stack">
                <div className="os-entity-copy">Runtime: {detail.manifest?.runtime ?? detail.runtimeType}</div>
                <div className="os-entity-copy">Permissions: {detail.manifest?.permissions?.join(', ') || 'None'}</div>
                <div className="os-entity-copy">Required secrets: {detail.manifest?.requiredSecrets?.join(', ') || 'None'}</div>
                <div className="os-entity-copy">Required skills: {(detail.manifest?.requiredSkills ?? detail.manifest?.skills ?? []).join(', ') || 'None'}</div>
              </div>
            </Card>
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Versions</div>
              {detail.versionHistory?.length ? (
                <ActivityFeed items={detail.versionHistory.map(version => ({
                  id: version.id,
                  title: version.version,
                  subtitle: version.changeSummary ?? 'No change summary recorded.',
                  time: formatDate(version.createdAt),
                }))} />
              ) : (
                <div className="os-empty-body">No version history recorded yet.</div>
              )}
            </Card>
          </div>
        )}
      </Drawer>

      <Drawer
        open={drawer.current?.id === 'registry-entry'}
        onClose={drawer.closeDrawer}
        title={selectedRegistry?.product ?? 'SDK registration'}
        description="Registration topics, discovery status, and legacy SDK recovery detail."
        routeSafe
      >
        {!selectedRegistry ? <EmptyState title="Registration unavailable" body="This SDK registration could not be loaded." /> : (
          <div className="os-drawer-stack">
            <Card>
              <div className="os-inline-actions">
                <StatusPill status={selectedRegistry.status} />
                <StatusPill status={selectedRegistry.discoveryStatus ?? 'unknown'} />
              </div>
              <div className="os-drawer-stack" style={{ marginTop: 12 }}>
                <div className="os-entity-copy">Command topic: {selectedRegistry.commandTopic || 'Missing'}</div>
                <div className="os-entity-copy">Status topic: {selectedRegistry.statusTopic || 'Missing'}</div>
                <div className="os-entity-copy">Registered: {formatDate(selectedRegistry.registeredAt)}</div>
                <div className="os-entity-copy">Last heartbeat: {formatDate(selectedRegistry.lastHeartbeatAt)}</div>
                <div className="os-entity-copy">App slug: {selectedRegistry.appSlug ?? 'Not indexed'}</div>
              </div>
            </Card>
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Recovery</div>
              <div className="os-entity-copy">{selectedRegistry.discoveryError ?? 'This SDK registration is indexed and healthy.'}</div>
              <div className="os-inline-actions" style={{ marginTop: 12 }}>
                <Button href="/developer/publish" variant="secondary">Open publishing</Button>
                <Button href="/sdk">Open SDK keys</Button>
              </div>
            </Card>
          </div>
        )}
      </Drawer>
    </div>
  );
}
