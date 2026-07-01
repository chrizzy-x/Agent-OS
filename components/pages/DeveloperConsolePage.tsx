'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import { Drawer } from '@/components/os/overlays';
import { useRouteDrawer } from '@/components/os/drawer-state';
import { resolveBrowserAccessState } from '@/src/auth/browser-access';
import { fetchBrowserSessionState, type BrowserSession, type BrowserSessionAuthState } from '@/src/auth/browser-session';
import {
  ActivityFeed,
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Input,
  LoadingState,
  MetricCard,
  PageHeader,
  SearchBar,
  StatusPill,
  Tabs,
} from '@/components/os/ui';

type DeveloperAnalytics = {
  totals?: {
    calls?: number;
    error_rate?: string;
    active_users?: number;
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
  publishState?: string | null;
  rejectionReason?: string | null;
};

type DeveloperEarnings = {
  this_month?: string;
  last_month?: string;
  all_time?: string;
  revenue_share_pct?: number;
  per_skill?: Array<{ skill_id: string; skill_name: string; skill_slug: string; total_calls: number; total_revenue: string }>;
};

type DeveloperWebhook = {
  id: string;
  name: string;
  callbackUrl: string;
  secretMasked: string;
  events: string[];
  status: string;
  failureCount: number;
  lastDeliveryAt: string | null;
};

type DeveloperWebhookLog = {
  id: string;
  webhookId: string;
  status: string;
  event: string;
  responseCode: number | null;
  error: string | null;
  createdAt: string;
};

type DeveloperSkill = {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  visibility?: string;
  published?: boolean;
  publish_state?: string | null;
  total_installs?: number;
  total_calls?: number;
  rating?: number;
  review_count?: number;
  rejection_reason?: string | null;
  icon_url?: string | null;
  banner_url?: string | null;
  video_url?: string | null;
  examples?: Array<Record<string, unknown>>;
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
type DeveloperTab = 'overview' | 'apps' | 'skills' | 'reviews' | 'media' | 'analytics' | 'revenue' | 'sdk' | 'webhooks' | 'settings';

const DEVELOPER_TABS: Array<{ key: DeveloperTab; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'apps', label: 'Apps' },
  { key: 'skills', label: 'Skills' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'media', label: 'Media' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'sdk', label: 'SDK' },
  { key: 'webhooks', label: 'Webhooks' },
  { key: 'settings', label: 'Settings' },
];

function formatDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : 'Not recorded';
}

export default function DeveloperConsolePage() {
  const drawer = useRouteDrawer<DrawerId>();
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [analytics, setAnalytics] = useState<DeveloperAnalytics | null>(null);
  const [earnings, setEarnings] = useState<DeveloperEarnings | null>(null);
  const [webhooks, setWebhooks] = useState<DeveloperWebhook[]>([]);
  const [webhookLogs, setWebhookLogs] = useState<DeveloperWebhookLog[]>([]);
  const [webhookName, setWebhookName] = useState('Store events');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookMessage, setWebhookMessage] = useState('');
  const [registry, setRegistry] = useState<KernelEntry[]>([]);
  const [apps, setApps] = useState<DeveloperApp[]>([]);
  const [skills, setSkills] = useState<DeveloperSkill[]>([]);
  const [detail, setDetail] = useState<AppDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [authState, setAuthState] = useState<BrowserSessionAuthState>('signed_out');
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<DeveloperTab>('overview');

  const canUseDeveloperConsole = session?.capabilities?.includes('access_developer_console') === true;
  const accessState = resolveBrowserAccessState(session, loading, 'access_developer_console', authState);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const current = await fetchBrowserSessionState().catch(() => ({ state: 'signed_out' as const, session: null }));
      setSession(current.session);
      setAuthState(current.state);
      if (!current.session) {
        setAnalytics(null);
        setEarnings(null);
        setWebhooks([]);
        setWebhookLogs([]);
        setRegistry([]);
        setApps([]);
        setSkills([]);
        return;
      }
      const [appsRes, skillsRes, analyticsRes, registryRes, earningsRes, webhooksRes] = await Promise.all([
        fetch('/api/apps?mine=1&sort=recent', { cache: 'no-store' }),
        fetch('/api/skills?mine=1&sort=recent&limit=100', { cache: 'no-store' }).catch(() => null),
        fetch('/api/developer/analytics', { cache: 'no-store' }).catch(() => null),
        fetch('/api/kernel/registry', { cache: 'no-store' }).catch(() => null),
        fetch('/api/developer/earnings', { cache: 'no-store' }).catch(() => null),
        fetch('/api/developer/webhooks', { cache: 'no-store' }).catch(() => null),
      ]);
      const appsData = await appsRes.json();
      setApps(appsData.apps ?? []);
      if (skillsRes?.ok) {
        const skillsData = await skillsRes.json();
        setSkills(skillsData.skills ?? []);
      } else {
        setSkills([]);
      }
      if (analyticsRes?.ok) {
        setAnalytics(await analyticsRes.json());
      } else {
        setAnalytics(null);
      }
      if (earningsRes?.ok) {
        setEarnings(await earningsRes.json());
      } else {
        setEarnings(null);
      }
      if (webhooksRes?.ok) {
        const webhookData = await webhooksRes.json();
        setWebhooks(webhookData.webhooks ?? []);
        setWebhookLogs(webhookData.logs ?? []);
      } else {
        setWebhooks([]);
        setWebhookLogs([]);
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
      setEarnings(null);
      setWebhooks([]);
      setWebhookLogs([]);
      setRegistry([]);
      setApps([]);
      setSkills([]);
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
  const filteredSkills = useMemo(
    () => skills.filter(skill => !search || `${skill.name} ${skill.description} ${skill.slug}`.toLowerCase().includes(search.toLowerCase())),
    [search, skills],
  );
  const recoveryEntries = useMemo(
    () => registry.filter(item => item.discoveryStatus === 'metadata_required' || item.discoveryStatus === 'hidden'),
    [registry],
  );
  const selectedRegistry = useMemo(
    () => registry.find(item => item.product === drawer.current?.entityId) ?? null,
    [drawer.current?.entityId, registry],
  );

  function publishStatus(item: { publishState?: string | null; publish_state?: string | null; published?: boolean; visibility?: string }) {
    const raw = item.publishState ?? item.publish_state;
    if (raw === 'submitted') return 'Submitted';
    if (raw === 'reviewing') return 'Reviewing';
    if (raw === 'approved') return 'Approved';
    if (raw === 'rejected') return 'Rejected';
    if (raw === 'update_pending') return 'Update Pending';
    if (raw === 'unpublished') return 'Unpublished';
    if (item.published === true || item.visibility === 'public') return 'Published';
    return 'Draft';
  }

  function rejectionReason(item: { rejectionReason?: string | null; rejection_reason?: string | null }) {
    return item.rejectionReason ?? item.rejection_reason ?? 'No rejection reason recorded.';
  }

  async function createWebhook() {
    setWebhookMessage('');
    const response = await fetch('/api/developer/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: webhookName,
        callbackUrl: webhookUrl,
        events: ['app.published', 'app.reviewed', 'skill.published', 'skill.reviewed'],
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setWebhookMessage(response.ok ? 'Webhook created.' : payload.error ?? payload.message ?? 'Webhook creation failed.');
    if (response.ok) {
      setWebhookUrl('');
      await load();
    }
  }

  async function deleteWebhook(id: string) {
    setWebhookMessage('');
    const response = await fetch(`/api/developer/webhooks?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    setWebhookMessage(response.ok ? 'Webhook deleted.' : 'Webhook deletion failed.');
    await load();
  }

  function renderMediaPreview() {
    const app = apps[0] ?? null;
    const skill = skills[0] ?? null;
    return (
      <div className="os-drawer-stack">
        <Card>
          <div className="os-entity-title" style={{ marginBottom: 12 }}>Media Manager</div>
          <div className="os-entity-copy">Manage listing media for Appstore and Skillstore previews. Screenshot upload is available in the app editor after the app slug exists.</div>
          <div className="settings-two-column" style={{ marginTop: 12 }}>
            <label className="os-entity-copy">Icon upload<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled /></label>
            <label className="os-entity-copy">Banner upload<input type="file" accept="image/png,image/jpeg,image/webp" disabled /></label>
            <label className="os-entity-copy">Gallery upload<input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled /></label>
            <label className="os-entity-copy">Video upload<input type="file" accept="video/mp4,video/webm" disabled /></label>
          </div>
          <div className="os-entity-copy" style={{ marginTop: 12 }}>Icon, banner, gallery, and video binary uploads are disabled until backend media storage is available.</div>
          {/* TODO: Connect disabled icon, banner, gallery, and video uploads to durable media storage with file type, size, and aspect ratio validation. */}
          <div className="os-inline-actions" style={{ marginTop: 12 }}>
            <Button disabled variant="secondary">Replace media</Button>
            <Button disabled variant="secondary">Delete media</Button>
            <Button disabled variant="secondary">Reorder media</Button>
            <Button disabled variant="secondary">Mark primary</Button>
            <Button href="/publish/app" variant="secondary">New app media</Button>
            <Button href="/publish/skill" variant="secondary">New skill media</Button>
          </div>
        </Card>
        <div className="market-shell" data-surface="developer-media-preview">
          <div className="market-app-row market-horizontal-row">
            {app ? (
              <article className="market-store-card">
                <div className="market-card-banner">{app.name}</div>
                <div className="market-store-card-main">
                  <div className="market-listing-mark">{app.name.slice(0, 2).toUpperCase()}</div>
                  <div>
                    <h3>{app.name}</h3>
                    <p>{app.description}</p>
                  </div>
                </div>
                <div className="market-card-actions">
                  <Button href={`/publish/app?slug=${encodeURIComponent(app.slug)}`} variant="secondary">Replace/Reorder</Button>
                  <Button href={`/appstore/${app.slug}`}>Listing Preview</Button>
                </div>
              </article>
            ) : null}
            {skill ? (
              <article className="market-store-card">
                <div className="market-card-banner">{skill.name}</div>
                <div className="market-store-card-main">
                  <div className="market-listing-mark">{skill.name.slice(0, 2).toUpperCase()}</div>
                  <div>
                    <h3>{skill.name}</h3>
                    <p>{skill.description}</p>
                  </div>
                </div>
                <div className="market-card-actions">
                  <Button href={`/publish/skill?slug=${encodeURIComponent(skill.slug)}`} variant="secondary">Replace/Reorder</Button>
                  <Button href={`/skills/${skill.slug}`}>Listing Preview</Button>
                </div>
              </article>
            ) : null}
          </div>
        </div>
        {!app && !skill ? <EmptyState title="No media to manage" body="Publish an app or skill to manage listing media." action={<Button href="/publish/app">Publish app</Button>} /> : null}
      </div>
    );
  }

  function renderDeveloperTab() {
    if (tab === 'overview') {
      return (
        <div className="os-drawer-stack">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            <MetricCard label="Developer Status" value={canUseDeveloperConsole ? 'Active' : 'Gated'} />
            <MetricCard label="SDK Status" value={registry.length ? 'Registered' : 'Not registered'} />
            <MetricCard label="Published Apps" value={apps.filter(app => publishStatus(app) === 'Published').length} />
            <MetricCard label="Published Skills" value={skills.filter(skill => publishStatus(skill) === 'Published').length} />
            <MetricCard label="Drafts" value={[...apps, ...skills].filter(item => publishStatus(item) === 'Draft').length} />
            <MetricCard label="Pending Reviews" value={[...apps, ...skills].filter(item => ['Submitted', 'Reviewing', 'Update Pending'].includes(publishStatus(item))).length} />
            <MetricCard label="Rejections" value={[...apps, ...skills].filter(item => publishStatus(item) === 'Rejected').length} />
            <MetricCard label="Revenue" value={earnings ? `$${earnings.all_time ?? '0.00'}` : 'No data'} />
            <MetricCard label="Usage" value={analytics?.totals?.calls ?? 0} />
          </div>
        </div>
      );
    }

    if (tab === 'apps') {
      return (
        <Card>
          <div className="os-entity-head" style={{ marginBottom: 12 }}>
            <div className="os-entity-title">Apps</div>
            <Button href="/publish/app">Publish App</Button>
          </div>
          {filteredApps.length === 0 ? (
            <EmptyState title="No apps yet" body="Publish an app or register an SDK app to populate this surface." action={<Button href="/publish/app">Publish app</Button>} />
          ) : (
            <DataTable
              columns={['App', 'Runtime', 'Review', 'Installs', 'Health', 'Actions']}
              rows={filteredApps.map(app => [
                app.name,
                app.runtimeType,
                <StatusPill key={`${app.id}-publish`} status={publishStatus(app)} />,
                String(app.installCount),
                <StatusPill key={`${app.id}-health`} status={app.healthStatus ?? 'unknown'} />,
                <div key={`${app.id}-actions`} className="os-inline-actions">
                  <Button variant="secondary" onClick={() => drawer.openDrawer('published-app', app.slug)}>Inspect</Button>
                  <Button href={`/publish/app?slug=${encodeURIComponent(app.slug)}`} variant="secondary">Update</Button>
                  <Button href={`/appstore/${app.slug}`}>Store page</Button>
                </div>,
              ])}
            />
          )}
        </Card>
      );
    }

    if (tab === 'skills') {
      return (
        <Card>
          <div className="os-entity-head" style={{ marginBottom: 12 }}>
            <div className="os-entity-title">Skills</div>
            <Button href="/publish/skill">Publish Skill</Button>
          </div>
          {filteredSkills.length === 0 ? (
            <EmptyState title="No skills yet" body="Publish a capability to populate this surface." action={<Button href="/publish/skill">Publish skill</Button>} />
          ) : (
            <DataTable
              columns={['Skill', 'Category', 'Review', 'Installs', 'Calls', 'Actions']}
              rows={filteredSkills.map(skill => [
                skill.name,
                skill.category,
                <StatusPill key={`${skill.id}-publish`} status={publishStatus(skill)} />,
                String(skill.total_installs ?? 0),
                String(skill.total_calls ?? 0),
                <div key={`${skill.id}-actions`} className="os-inline-actions">
                  <Button href={`/publish/skill?slug=${encodeURIComponent(skill.slug)}`} variant="secondary">Update</Button>
                  <Button href={`/skills/${skill.slug}`}>Store page</Button>
                </div>,
              ])}
            />
          )}
        </Card>
      );
    }

    if (tab === 'reviews') {
      const items = [...apps.map(app => ({ id: app.id, name: app.name, type: 'App', status: publishStatus(app), reason: rejectionReason(app) })), ...skills.map(skill => ({ id: skill.id, name: skill.name, type: 'Skill', status: publishStatus(skill), reason: rejectionReason(skill) }))];
      return (
        <Card>
          <div className="os-entity-title" style={{ marginBottom: 12 }}>Review Pipeline</div>
          <DataTable
            columns={['Listing', 'Type', 'Status', 'Rejection Reason']}
            rows={items.map(item => [
              item.name,
              item.type,
              <StatusPill key={`${item.id}-status`} status={item.status} />,
              item.status === 'Rejected' ? item.reason : 'No rejection reason recorded.',
            ])}
          />
        </Card>
      );
    }

    if (tab === 'media') return renderMediaPreview();

    if (tab === 'analytics') {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <MetricCard label="Installs" value={analytics?.app_totals?.installs ?? apps.reduce((sum, app) => sum + app.installCount, 0)} />
          <MetricCard label="Active users" value={analytics?.totals?.active_users ?? analytics?.app_totals?.opens ?? 0} />
          <MetricCard label="API calls" value={analytics?.totals?.calls ?? 0} />
          <MetricCard label="Error rate" value={`${analytics?.totals?.error_rate ?? '0.0'}%`} />
          <MetricCard label="Opens" value={analytics?.app_totals?.opens ?? 0} />
          <MetricCard label="Downloads" value={analytics?.app_totals?.downloads ?? 0} />
        </div>
      );
    }

    if (tab === 'revenue') {
      return (
        <div className="os-drawer-stack">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            <MetricCard label="Revenue Summary" value={`$${earnings?.all_time ?? '0.00'}`} />
            <MetricCard label="Monthly Revenue" value={`$${earnings?.this_month ?? '0.00'}`} />
            <MetricCard label="Last Month" value={`$${earnings?.last_month ?? '0.00'}`} />
            <MetricCard label="Payout Status" value={Number(earnings?.all_time ?? 0) > 0 ? 'Pending' : 'No payout'} />
          </div>
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 12 }}>App Revenue</div>
            <div className="os-entity-copy">No paid app transactions recorded.</div>
          </Card>
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 12 }}>Skill Revenue</div>
            {(earnings?.per_skill ?? []).length === 0 ? <div className="os-empty-body">No skill revenue recorded.</div> : (
              <DataTable
                columns={['Skill', 'Calls', 'Revenue']}
                rows={(earnings?.per_skill ?? []).map(item => [item.skill_name, String(item.total_calls), `$${item.total_revenue}`])}
              />
            )}
          </Card>
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 12 }}>Payout History</div>
            <div className="os-empty-body">No payout history recorded.</div>
          </Card>
        </div>
      );
    }

    if (tab === 'sdk') {
      return (
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
                item.discoveryStatus === 'metadata_required' ? (item.discoveryError ?? 'Metadata required') : item.appSlug ? `Indexed as ${item.appSlug}` : item.discoveryStatus ?? 'unknown',
                new Date(item.registeredAt).toLocaleDateString(),
                formatDate(item.lastHeartbeatAt),
                <Button key={`${item.product}-inspect`} variant="secondary" onClick={() => drawer.openDrawer('registry-entry', item.product)}>Inspect</Button>,
              ])}
            />
          )}
        </Card>
      );
    }

    if (tab === 'webhooks') {
      return (
        <div className="os-drawer-stack">
          <Card>
            <div className="os-entity-head" style={{ marginBottom: 12 }}>
              <div className="os-entity-title">Create Webhook</div>
              <Button onClick={() => void createWebhook()}>Create</Button>
            </div>
            <div className="settings-two-column">
              <Input value={webhookName} onChange={event => setWebhookName(event.target.value)} placeholder="Webhook name" />
              <Input value={webhookUrl} onChange={event => setWebhookUrl(event.target.value)} placeholder="Callback URL" />
            </div>
            {webhookMessage ? <div className="os-entity-copy" style={{ marginTop: 12 }}>{webhookMessage}</div> : null}
          </Card>
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 12 }}>Webhooks</div>
            {webhooks.length === 0 ? <div className="os-empty-body">No developer webhooks configured.</div> : (
              <DataTable
                columns={['Name', 'Callback URL', 'Events', 'Failures', 'Secret', 'Actions']}
                rows={webhooks.map(item => [
                  item.name,
                  item.callbackUrl,
                  item.events.join(', '),
                  String(item.failureCount),
                  item.secretMasked,
                  <div key={`${item.id}-actions`} className="os-inline-actions">
                    <Button variant="secondary" onClick={() => void deleteWebhook(item.id)}>Delete</Button>
                  </div>,
                ])}
              />
            )}
          </Card>
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 12 }}>Logs, Failures, Retries</div>
            {webhookLogs.length === 0 ? <div className="os-empty-body">No webhook delivery logs recorded.</div> : (
              <DataTable
                columns={['Event', 'Status', 'Response', 'Error', 'Time']}
                rows={webhookLogs.map(item => [
                  item.event,
                  <StatusPill key={`${item.id}-status`} status={item.status} />,
                  item.responseCode === null ? 'None' : String(item.responseCode),
                  item.error ?? 'None',
                  formatDate(item.createdAt),
                ])}
              />
            )}
          </Card>
        </div>
      );
    }

    return (
      <Card>
        <div className="os-entity-title" style={{ marginBottom: 12 }}>Developer Settings</div>
        <div className="os-drawer-stack">
          <div className="os-entity-copy">Developer access: {canUseDeveloperConsole ? 'Active' : 'Enterprise access required'}</div>
          <div className="os-entity-copy">Review submissions use listing visibility and publish state.</div>
          <div className="os-entity-copy">Unpublish by moving a listing to private or unpublished in its editor.</div>
        </div>
      </Card>
    );
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/developer" />
      <WorkspaceShell
        activePath="/developer"
        aside={(
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 12 }}>Summary</div>
            <div className="os-drawer-stack">
              <Badge tone={accessState === 'forbidden' ? 'warning' : accessState === 'allowed' ? 'accent' : 'default'}>
                {accessState === 'allowed' ? 'Enterprise developer access' : accessState === 'signed_out' ? 'Sign in required' : accessState === 'expired' ? 'Session expired' : accessState === 'forbidden' ? 'Enterprise access required' : 'Checking access'}
              </Badge>
              <div className="os-entity-copy">Published apps: {apps.length}</div>
              <div className="os-entity-copy">Published skills: {skills.length}</div>
              <div className="os-entity-copy">SDK registrations: {registry.length}</div>
              <div className="os-entity-copy">Recovery needed: {recoveryEntries.length}</div>
              <Button href="/publish/app" variant="secondary">Publish app</Button>
              <Button href="/publish/skill" variant="secondary">Publish skill</Button>
            </div>
          </Card>
        )}
      >
        {accessState === 'allowed' ? (
          <PageHeader
            eyebrow="Developer Console"
            title="Publishing Console"
            subtitle="Publish, review, analyze, monetize, and manage Appstore and Skillstore listings."
            actions={<Button href="/sdk">Open SDK</Button>}
          />
        ) : accessState === 'signed_out' ? (
          <PageHeader eyebrow="Developer Access" title="Sign in required" subtitle="Developer Console is available only after sign-in and plan validation." />
        ) : accessState === 'forbidden' ? (
          <PageHeader eyebrow="Developer Access" title="Enterprise access required" subtitle="Free and Pro plans cannot open publishing, SDK, analytics, or billing controls." />
        ) : (
          <PageHeader eyebrow="Developer Access" title="Checking access" subtitle="Validating developer permissions for this workspace." />
        )}

        {loading ? <LoadingState label="Loading developer console" /> : !session ? (
          authState === 'expired'
            ? <EmptyState title="Session expired" body="Sign in again to manage apps, SDK registrations, and analytics." action={<Button href="/signin">Sign in again</Button>} />
            : <EmptyState title="Sign in required" body="Sign in to manage apps, SDK registrations, and analytics." action={<Button href="/signin">Sign in</Button>} />
        ) : !canUseDeveloperConsole ? (
          <EmptyState title="Enterprise access required" body="Developer Console stays gated to enterprise-capable workspaces." action={<Button href="/studio">Open Studio</Button>} />
        ) : (
          <div className="os-drawer-stack">
            <Tabs tabs={DEVELOPER_TABS} active={tab} onChange={key => setTab(key as DeveloperTab)} />
            {tab === 'apps' || tab === 'skills' ? (
              <SearchBar value={search} onChange={event => setSearch(event.target.value)} placeholder="Search listings and slugs" />
            ) : null}
            {renderDeveloperTab()}
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
                <Button href="/publish/app" variant="secondary">Open publishing</Button>
                <Button href="/sdk">Open SDK keys</Button>
              </div>
            </Card>
          </div>
        )}
      </Drawer>
    </div>
  );
}
