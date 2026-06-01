'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Nav from '@/components/Nav';
import type { AgentAppListing } from '@/src/appstore/catalog';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import {
  AppShell,
  Badge,
  Button,
  Card,
  CommandCard,
  EmptyState,
  LoadingState,
  PageHeader,
  PermissionCard,
  SidebarNav,
  SidebarSection,
  Tabs,
} from '@/components/os/ui';

type AppDetails = AgentAppListing & {
  longDescription?: string;
};

type Installation = {
  favorite?: boolean;
  permissionsApproved?: string[];
};

const APP_TABS = ['Overview', 'Commands', 'Permissions', 'Secrets', 'Reviews', 'Changelog'];

function runtimeLabel(app: AppDetails | null): string {
  if (!app) return 'App';
  if (app.source === 'external_sdk') return 'External SDK';
  if (app.runtimeType === 'workspace-app') return 'Workspace App';
  return 'Internal App';
}

export default function AppDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';
  const [tab, setTab] = useState('Overview');
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [app, setApp] = useState<AppDetails | null>(null);
  const [installation, setInstallation] = useState<Installation | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState('');
  const [pendingPermissions, setPendingPermissions] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const currentSession = await fetchBrowserSession().catch(() => null);
        const [appRes, installedRes] = await Promise.all([
          fetch(`/api/apps/${slug}`, { cache: 'no-store' }),
          currentSession ? fetch('/api/apps/installed', { cache: 'no-store' }) : Promise.resolve(null),
        ]);
        const appData = await appRes.json();
        const installedData = installedRes ? await installedRes.json() : { installedApps: [] };
        const installedApp = (installedData.installedApps ?? []).find((item: { slug?: string }) => item.slug === slug) ?? null;
        if (active) {
          setSession(currentSession);
          setApp(appData.app ?? null);
          setInstallation((installedApp?.installation as Installation | undefined) ?? null);
        }
      } catch {
        if (active) {
          setApp(null);
          setInstallation(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    if (slug) void load();
    return () => { active = false; };
  }, [slug]);

  const commands = useMemo(() => app?.manifest.commands ?? [], [app]);
  const requiredPermissions = useMemo(
    () => app ? (app.permissionsRequired.length > 0 ? app.permissionsRequired : app.manifest.permissions) : [],
    [app],
  );
  const requiredSkills = useMemo(
    () => app ? (app.manifest.requiredSkills.length > 0 ? app.manifest.requiredSkills : app.manifest.skills) : [],
    [app],
  );

  async function install() {
    if (!app) return;
    setInstalling(true);
    setNotice('');
    try {
      const currentSession = await fetchBrowserSession();
      if (!currentSession) return;
      const response = await fetch('/api/apps/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: app.slug,
          permissionsApproved: pendingPermissions.length > 0 ? pendingPermissions : requiredPermissions,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        if (Array.isArray(payload.requiredPermissions)) {
          setPendingPermissions(payload.requiredPermissions);
        }
        setNotice(payload.error ?? payload.message ?? 'Install failed');
        return;
      }
      setInstallation(payload.installation ?? null);
      setPendingPermissions([]);
      setNotice(`Installed ${app.name}.`);
    } finally {
      setInstalling(false);
    }
  }

  async function openApp() {
    if (!app || !session) return;
    setWorking(true);
    setNotice('');
    try {
      const response = await fetch(`/api/apps/${app.slug}/open`, { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) {
        setNotice(payload.error ?? payload.message ?? 'Open failed');
        return;
      }
      setInstallation(payload.installation ?? installation);
      if (typeof payload.openUrl === 'string' && payload.openUrl.length > 0) {
        window.open(payload.openUrl, '_blank', 'noopener,noreferrer');
      }
      setNotice(`Opened ${app.name}.`);
    } finally {
      setWorking(false);
    }
  }

  async function uninstallApp() {
    if (!app) return;
    setWorking(true);
    setNotice('');
    try {
      const response = await fetch(`/api/apps/${app.slug}/installation`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) {
        setNotice(payload.error ?? payload.message ?? 'Uninstall failed');
        return;
      }
      setInstallation(null);
      setNotice(`Uninstalled ${app.name}.`);
    } finally {
      setWorking(false);
    }
  }

  async function toggleFavorite() {
    if (!app || !installation) return;
    setWorking(true);
    try {
      const response = await fetch(`/api/apps/${app.slug}/installation`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite: !(installation.favorite === true) }),
      });
      const payload = await response.json();
      if (response.ok) {
        setInstallation(payload.installation ?? installation);
      }
    } finally {
      setWorking(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/appstore" />
      <AppShell
        activePath="/appstore"
        sidebar={(
          <SidebarSection title="Appstore">
            <SidebarNav
              items={[
                { href: '/appstore', label: 'Back to Appstore' },
                { href: `/appstore/${slug}`, label: 'Overview', active: true },
                ...(session?.capabilities?.includes('access_developer_console') ? [{ href: '/developer', label: 'Developer' }] : []),
                { href: '/vault', label: 'Vault' },
              ]}
            />
          </SidebarSection>
        )}
        aside={(
          <SidebarSection title="Details">
            {app ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Badge tone="accent">{runtimeLabel(app)}</Badge>
                {app.source === 'external_sdk' ? <Badge tone="accent">Auto-discovered via AgentOS SDK</Badge> : null}
                <Badge tone="default">{app.healthStatus}</Badge>
                <div className="os-entity-copy">{app.category}</div>
                <div className="os-entity-copy">{app.deviceTargets.join(' • ') || 'AgentOS Cloud'}</div>
                <Link href={`/api/apps/${app.slug}/download`} className="btn-outline">Download package</Link>
                {app.distribution.webUrl ? <a href={app.distribution.webUrl} className="btn-outline" target="_blank" rel="noreferrer">Open web target</a> : null}
                {app.distribution.androidUrl ? <a href={app.distribution.androidUrl} className="btn-outline" target="_blank" rel="noreferrer">Android</a> : null}
                {app.distribution.iosUrl ? <a href={app.distribution.iosUrl} className="btn-outline" target="_blank" rel="noreferrer">iOS</a> : null}
              </div>
            ) : null}
          </SidebarSection>
        )}
      >
        {loading ? <LoadingState label="Loading app details" /> : !app ? (
          <EmptyState title="App not found" body="This app is private, unavailable, or the slug does not exist." action={<Button href="/appstore">Back to Appstore</Button>} />
        ) : (
          <>
            <PageHeader
              eyebrow="App details"
              title={app.name}
              subtitle={app.longDescription || app.description}
              actions={(
                <>
                  <Badge tone="accent">{runtimeLabel(app)}</Badge>
                  {app.verified ? <Badge tone="success">Verified</Badge> : null}
                  {installation ? <Button onClick={() => void openApp()}>{working ? 'Opening...' : 'Open'}</Button> : <Button onClick={() => void install()}>{installing ? 'Installing...' : pendingPermissions.length > 0 ? 'Approve & Install' : 'Install'}</Button>}
                  {installation ? <Button variant="secondary" onClick={() => void uninstallApp()}>{working ? 'Working...' : 'Uninstall'}</Button> : null}
                  {installation ? <Button variant="secondary" onClick={() => void toggleFavorite()}>{installation.favorite === true ? 'Unpin' : 'Pin'}</Button> : null}
                  <Link href={`/api/apps/${app.slug}/download`} className="btn-outline">Download</Link>
                </>
              )}
            />

            <Card>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <Badge tone="default">{app.installCount.toLocaleString()} installs</Badge>
                <Badge tone="default">{app.publisherName || 'AgentOS Publisher'}</Badge>
                <Badge tone="default">Updated {new Date(app.updatedAt).toLocaleDateString()}</Badge>
                {installation ? <Badge tone="accent">Installed</Badge> : null}
              </div>
              {notice ? <div className="os-entity-copy" style={{ marginBottom: 12 }}>{notice}</div> : null}
              <Tabs tabs={APP_TABS.map(item => ({ key: item, label: item }))} active={tab} onChange={setTab} />
            </Card>

            {tab === 'Overview' ? (
              <Card>
                <div className="os-entity-copy" style={{ marginBottom: 16 }}>{app.longDescription || app.description}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  <Card>
                    <div className="os-sidebar-title">Runtime</div>
                    <div className="os-entity-title">{runtimeLabel(app)}</div>
                  </Card>
                  <Card>
                    <div className="os-sidebar-title">Version</div>
                    <div className="os-entity-title">{app.manifest.version || '1.0.0'}</div>
                  </Card>
                  <Card>
                    <div className="os-sidebar-title">Entrypoint</div>
                    <div className="os-entity-copy">{app.manifest.entrypoint}</div>
                  </Card>
                  <Card>
                    <div className="os-sidebar-title">Device targets</div>
                    <div className="os-entity-copy">{app.deviceTargets.join(' • ') || 'AgentOS Cloud'}</div>
                  </Card>
                  <Card>
                    <div className="os-sidebar-title">Permissions</div>
                    <div className="os-entity-copy">{requiredPermissions.join(', ') || 'None declared'}</div>
                  </Card>
                  <Card>
                    <div className="os-sidebar-title">Required skills</div>
                    <div className="os-entity-copy">{requiredSkills.join(' • ') || 'None required'}</div>
                  </Card>
                </div>
              </Card>
            ) : null}

            {tab === 'Commands' ? (
              commands.length === 0 ? <EmptyState title="No commands declared" body="This app has not exposed callable commands yet." /> : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {commands.map(command => (
                    <CommandCard key={command.name} name={command.name} description={command.description} payload={JSON.stringify(command, null, 2)} />
                  ))}
                </div>
              )
            ) : null}

            {tab === 'Permissions' ? (
              <div style={{ display: 'grid', gap: 12 }}>
                {(requiredPermissions.length > 0 ? requiredPermissions : ['No special permissions declared']).map(permission => (
                  <PermissionCard key={permission} title={permission} description="Visible before install so workspace owners can review and approve access scope." required />
                ))}
              </div>
            ) : null}

            {tab === 'Secrets' ? (
              <div style={{ display: 'grid', gap: 12 }}>
                {(app.requiredSecrets.length > 0 ? app.requiredSecrets : ['No required secrets']).map(secret => (
                  <PermissionCard key={secret} title={secret} description="Assign this from Vault before the app runs in production." required={secret !== 'No required secrets'} />
                ))}
              </div>
            ) : null}

            {tab === 'Reviews' ? <EmptyState title="Reviews are coming online" body="Install and usage telemetry are available now; review submission UI has not been released yet." /> : null}
            {tab === 'Changelog' ? <EmptyState title="No changelog entries yet" body="Version metadata is available, but no release notes have been published for this app yet." /> : null}
          </>
        )}
      </AppShell>
    </div>
  );
}
