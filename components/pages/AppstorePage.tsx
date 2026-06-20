'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import SurfaceShell from '@/components/os/surface-shell';
import GlobalSearch from '@/components/os/global-search';
import { useApplicationShell } from '@/components/os/application-shell';
import { useRouteDrawer } from '@/components/os/drawer-state';
import { ConfirmModal, Drawer } from '@/components/os/overlays';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import type { AgentAppListing } from '@/src/appstore/catalog';
import {
  AppCard,
  Badge,
  Button,
  Card,
  EmptyState,
  FilterChips,
  LoadingState,
  SearchBar,
} from '@/components/os/ui';

const CATEGORY_CHIPS = ['All', 'AI', 'Finance', 'Productivity', 'Research', 'Developer', 'Data', 'Social', 'Utilities'];

type AppOpenTarget = 'web' | 'android' | 'ios';

type InstalledAppCard = AgentAppListing & {
  installation?: {
    favorite?: boolean;
    permissionsApproved?: string[];
    installedVersion?: string | null;
    updateAvailable?: boolean;
    status?: 'active' | 'disabled' | 'removed';
  };
  readiness?: {
    requiredPermissions: string[];
    missingPermissions: string[];
    missingSecrets: string[];
    missingSkills: string[];
    appUnavailableReason?: string | null;
    ready: boolean;
    updateAvailable: boolean;
    targets: Array<{ target: AppOpenTarget; url: string }>;
  };
};

type AppDetails = InstalledAppCard & {
  longDescription?: string;
};

function runtimeLabel(app: AgentAppListing | null): string {
  if (!app) return 'App';
  if (app.source === 'external_sdk' || app.kernelProduct) return 'SDK App';
  if (app.source === 'internal' || app.runtimeType === 'agentos-app' || app.runtimeType === 'workspace-app') return 'Native App';
  return 'External App';
}

function matchCategory(app: AgentAppListing, category: string): boolean {
  if (category === 'All') return true;
  if (category === 'AI') return `${app.category} ${app.description}`.toLowerCase().includes('ai');
  if (category === 'Developer') return `${app.category} ${app.description}`.toLowerCase().includes('dev');
  if (category === 'Utilities') return `${app.category} ${app.description}`.toLowerCase().includes('util');
  return `${app.category} ${app.description}`.toLowerCase().includes(category.toLowerCase());
}

function getInstalledState(app: InstalledAppCard | null | undefined): { label: string; tone: 'default' | 'accent' | 'success' | 'warning' | 'danger' } | null {
  if (!app?.installation) return null;
  if (app.readiness?.appUnavailableReason) return { label: 'Unavailable', tone: 'danger' };
  if (app.installation.status === 'disabled') return { label: 'Disabled', tone: 'warning' };
  if (app.readiness?.updateAvailable) return { label: 'Update available', tone: 'accent' };
  if (app.readiness && !app.readiness.ready) {
    if (app.readiness.missingPermissions.length > 0) return { label: 'Needs approval', tone: 'warning' };
    if (app.readiness.missingSecrets.length > 0) return { label: 'Missing secrets', tone: 'danger' };
    if (app.readiness.missingSkills.length > 0) return { label: 'Missing skills', tone: 'warning' };
    return { label: 'Not ready', tone: 'warning' };
  }
  return { label: 'Ready', tone: 'success' };
}

function platformBadges(app: AppDetails | null): string[] {
  if (!app) return [];
  const targets = new Set<string>();
  if (app.distribution.webUrl || app.appUrl) targets.add('Web');
  if (app.distribution.androidUrl) targets.add('Android');
  if (app.distribution.iosUrl) targets.add('iOS');
  return [...targets];
}

export default function AppstorePage() {
  const shell = useApplicationShell();
  const drawer = useRouteDrawer<'app-preview' | 'app-install'>();
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [apps, setApps] = useState<AgentAppListing[]>([]);
  const [installedApps, setInstalledApps] = useState<InstalledAppCard[]>([]);
  const [detail, setDetail] = useState<AppDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [notice, setNotice] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);

  const loadListings = useCallback(async () => {
    setLoading(true);
    try {
      const [publicRes, currentSession] = await Promise.all([
        fetch('/api/apps?sort=popular', { cache: 'no-store' }),
        fetchBrowserSession().catch(() => null),
      ]);
      const publicData = await publicRes.json();
      setApps(publicData.apps ?? []);
      setSession(currentSession);
      if (currentSession) {
        const installedRes = await fetch(`/api/apps/installed${shell.activeWorkspaceId ? `?workspaceId=${encodeURIComponent(shell.activeWorkspaceId)}` : ''}`, { cache: 'no-store' });
        const installedData = await installedRes.json();
        setInstalledApps(installedData.installedApps ?? []);
      } else {
        setInstalledApps([]);
      }
    } catch {
      setApps([]);
      setInstalledApps([]);
    } finally {
      setLoading(false);
    }
  }, [shell.activeWorkspaceId]);

  const loadDetail = useCallback(async (slug: string) => {
    setDetailLoading(true);
    try {
      const [appRes, readinessRes] = await Promise.all([
        fetch(`/api/apps/${slug}`, { cache: 'no-store' }),
        session ? fetch(`/api/apps/${slug}/readiness`, { cache: 'no-store' }).catch(() => null) : Promise.resolve(null),
      ]);
      const appData = await appRes.json().catch(() => ({}));
      const readinessData = readinessRes ? await readinessRes.json().catch(() => ({})) : {};
      const installedMatch = installedApps.find(item => item.slug === slug);
      setDetail({
        ...(appData.app ?? {}),
        installation: readinessData.installation ?? installedMatch?.installation ?? null,
        readiness: readinessData.ready === undefined ? installedMatch?.readiness : {
          installation: readinessData.installation ?? null,
          requiredPermissions: readinessData.requiredPermissions ?? [],
          missingPermissions: readinessData.missingPermissions ?? [],
          missingSecrets: readinessData.missingSecrets ?? [],
          missingSkills: readinessData.missingSkills ?? [],
          appUnavailableReason: typeof readinessData.appUnavailableReason === 'string' ? readinessData.appUnavailableReason : null,
          ready: readinessData.ready === true,
          updateAvailable: readinessData.updateAvailable === true,
          targets: readinessData.targets ?? [],
        },
      });
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, [installedApps, session]);

  useEffect(() => {
    void loadListings();
  }, [loadListings]);

  useEffect(() => {
    if (!drawer.current?.entityId) {
      setDetail(null);
      return;
    }
    void loadDetail(drawer.current.entityId);
  }, [drawer.current?.entityId, loadDetail]);

  const filtered = useMemo(
    () => apps.filter(app => {
      const matchesSearch = !search || `${app.name} ${app.description} ${app.category}`.toLowerCase().includes(search.toLowerCase());
      return matchesSearch && matchCategory(app, category);
    }),
    [apps, category, search],
  );
  const featuredApps = useMemo(() => apps.filter(app => app.verified).slice(0, 4), [apps]);
  const developerProfiles = useMemo(() => [...new Map(
    apps
      .filter(app => app.publisherName)
      .map(app => [app.publisherId || app.publisherName, { id: app.publisherId || app.publisherName, name: app.publisherName, apps: apps.filter(item => item.publisherName === app.publisherName).length }]),
  ).values()].slice(0, 8), [apps]);

  const installedBySlug = useMemo(
    () => new Map(installedApps.map(app => [app.slug, app])),
    [installedApps],
  );

  const requiredPermissions = detail?.readiness?.requiredPermissions.length
    ? detail.readiness.requiredPermissions
    : detail?.permissionsRequired ?? detail?.manifest.permissions ?? [];
  const requiredSecrets = detail?.requiredSecrets.length
    ? detail.requiredSecrets
    : detail?.manifest.requiredSecrets ?? [];
  const requiredSkills = detail?.manifest.requiredSkills?.length
    ? detail.manifest.requiredSkills
    : detail?.manifest.skills ?? [];
  const state = getInstalledState(detail);

  async function refreshCurrentDetail() {
    await loadListings();
    if (drawer.current?.entityId) {
      await loadDetail(drawer.current.entityId);
    }
  }

  async function installCurrent() {
    if (!detail) return;
    setWorking(true);
    setNotice('');
    try {
      const response = await fetch('/api/apps/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: detail.slug,
          permissionsApproved: requiredPermissions,
          workspaceId: shell.activeWorkspaceId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(payload.error ?? payload.message ?? 'Install failed');
        return;
      }
      setNotice(`Installed ${detail.name}.`);
      await refreshCurrentDetail();
    } finally {
      setWorking(false);
    }
  }

  async function approvePermissions() {
    if (!detail) return;
    setWorking(true);
    setNotice('');
    try {
      const response = await fetch(`/api/apps/${detail.slug}/installation`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissionsApproved: requiredPermissions }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(payload.error ?? payload.message ?? 'Permission approval failed');
        return;
      }
      setNotice('Permissions approved.');
      await refreshCurrentDetail();
    } finally {
      setWorking(false);
    }
  }

  async function openTarget(target: AppOpenTarget) {
    if (!detail) return;
    setWorking(true);
    setNotice('');
    try {
      const response = await fetch(`/api/apps/${detail.slug}/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(payload.error ?? payload.message ?? 'Open failed');
        return;
      }
      if (typeof payload.openUrl === 'string') {
        window.open(payload.openUrl, '_blank', 'noopener,noreferrer');
      }
      setNotice(`Opened ${detail.name}.`);
      await refreshCurrentDetail();
    } finally {
      setWorking(false);
    }
  }

  async function toggleFavorite() {
    if (!detail?.installation) return;
    setWorking(true);
    try {
      const response = await fetch(`/api/apps/${detail.slug}/installation`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite: !(detail.installation.favorite === true) }),
      });
      const payload = await response.json().catch(() => ({}));
      setNotice(response.ok ? (detail.installation.favorite ? 'Removed favorite.' : 'Added favorite.') : payload.error ?? 'Favorite update failed');
      await refreshCurrentDetail();
    } finally {
      setWorking(false);
    }
  }

  async function removeCurrent() {
    if (!detail) return;
    setWorking(true);
    try {
      const response = await fetch(`/api/apps/${detail.slug}/installation`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(payload.error ?? payload.message ?? 'Remove failed');
        return;
      }
      setNotice(`Removed ${detail.name}.`);
      setConfirmRemove(false);
      await refreshCurrentDetail();
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <SurfaceShell
        activePath="/appstore"
        title="App Store"
        subtitle="Discovery center for apps your workspace can install and use."
        actions={session?.capabilities?.includes('create_app') ? <Button href="/developer/publish" variant="secondary">Publish app</Button> : undefined}
      >
        <div className="os-drawer-stack">
          <Card style={{ minHeight: 180, display: 'grid', alignContent: 'center', gap: 12 }}>
            <div className="os-entity-title">Featured Apps</div>
            <div className="os-entity-copy">Discover SDK, Native, and External apps for AgentOS workspaces.</div>
            <div className="os-inline-actions">
              {featuredApps.slice(0, 3).map(app => <Button key={app.id} variant="secondary" onClick={() => drawer.openDrawer('app-preview', app.slug)}>{app.name}</Button>)}
            </div>
          </Card>
          <Card>
            <nav className="os-inline-actions" aria-label="App Store module">
              <Link href="/appstore" className="btn-primary">Discovery</Link>
              <a href="#installed-apps" className="btn-ghost">Installed Apps</a>
              <a href="#app-categories" className="btn-ghost">Categories</a>
              <a href="#featured-apps" className="btn-ghost">Featured Apps</a>
              <a href="#developer-profiles" className="btn-ghost">Developer Profiles</a>
            </nav>
          </Card>
          {session ? (
            <Card>
              <span id="installed-apps" />
              <div className="os-inline-actions" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <div className="os-entity-copy">{installedApps.length} installed</div>
                <div className="os-inline-actions">
                  {installedApps.slice(0, 4).map(app => (
                    <Button key={app.id} variant="secondary" onClick={() => drawer.openDrawer('app-preview', app.slug)}>
                      {app.name}
                    </Button>
                  ))}
                </div>
              </div>
            </Card>
          ) : null}
          <GlobalSearch />
          <SearchBar value={search} onChange={event => setSearch(event.target.value)} placeholder="Search anything..." />
          <div id="app-categories">
            <FilterChips items={CATEGORY_CHIPS} active={category} onChange={setCategory} />
          </div>
          {featuredApps.length > 0 ? (
            <Card>
              <div id="featured-apps" className="os-entity-title">Featured Apps</div>
              <div className="os-inline-actions">
                {featuredApps.map(app => <Button key={app.id} variant="secondary" onClick={() => drawer.openDrawer('app-preview', app.slug)}>{app.name}</Button>)}
              </div>
            </Card>
          ) : null}
          {developerProfiles.length > 0 ? (
            <Card>
              <div id="developer-profiles" className="os-entity-title">Developer Profiles</div>
              <div className="os-inline-actions">
                {developerProfiles.map(profile => <Badge key={profile.id} tone="default">{profile.name} · {profile.apps}</Badge>)}
              </div>
            </Card>
          ) : null}
        </div>

        {loading ? <LoadingState label="Loading App Store" /> : filtered.length === 0 ? (
          <EmptyState title="No apps found" body="No accessible apps matched this search or category." />
        ) : (
          <div className="os-drawer-stack">
            {session ? (
              <Card>
                <div className="os-entity-head" style={{ marginBottom: 12 }}>
                  <div className="os-entity-title">Installed apps</div>
                  <Badge tone="accent">{installedApps.length}</Badge>
                </div>
                {installedApps.length === 0 ? (
                  <div className="os-empty-body">No installed apps yet.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                    {installedApps.slice(0, 4).map(app => (
                      <AppCard
                        key={app.id}
                        title={app.name}
                        description={app.description}
                        runtime={runtimeLabel(app)}
                        verified={app.verified}
                        badge={getInstalledState(app) ? <Badge tone={getInstalledState(app)?.tone ?? 'default'}>{getInstalledState(app)?.label}</Badge> : undefined}
                        footer={(
                          <div className="os-inline-actions">
                            <Button variant="secondary" onClick={() => drawer.openDrawer('app-preview', app.slug)}>Inspect</Button>
                            <Button onClick={() => drawer.openDrawer('app-install', app.slug)}>Manage</Button>
                          </div>
                        )}
                      />
                    ))}
                  </div>
                )}
              </Card>
            ) : null}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
              {filtered.map(app => {
                const installed = installedBySlug.get(app.slug);
                const installedState = getInstalledState(installed);
                return (
                  <AppCard
                    key={app.id}
                    title={app.name}
                    description={app.description}
                    runtime={runtimeLabel(app)}
                    verified={app.verified}
                    badge={installedState ? <Badge tone={installedState.tone}>{installedState.label}</Badge> : undefined}
                    footer={(
                      <div className="os-inline-actions">
                        <Button variant="secondary" onClick={() => drawer.openDrawer('app-preview', app.slug)}>Preview</Button>
                        <Button onClick={() => drawer.openDrawer('app-install', app.slug)}>{installed ? 'Manage' : 'Install'}</Button>
                      </div>
                    )}
                  />
                );
              })}
            </div>
          </div>
        )}
      </SurfaceShell>

      <Drawer
        open={drawer.current?.id === 'app-preview'}
        onClose={drawer.closeDrawer}
        title={detail?.name ?? 'App preview'}
        description={detail?.description ?? 'Preview app details'}
        routeSafe
      >
        {detailLoading ? <LoadingState label="Loading app preview" /> : !detail ? (
          <EmptyState title="App unavailable" body="This app could not be loaded." />
        ) : (
          <>
            <Card>
              <div className="os-inline-actions">
                <Badge tone="accent">{runtimeLabel(detail)}</Badge>
                {state ? <Badge tone={state.tone}>{state.label}</Badge> : null}
                {platformBadges(detail).map(item => <Badge key={item} tone="default">{item}</Badge>)}
              </div>
              <div className="os-drawer-stack" style={{ marginTop: 12 }}>
                <div className="os-entity-copy">{detail.longDescription || detail.description}</div>
                <Button href={`/appstore/${detail.slug}`} variant="secondary">Open full page</Button>
              </div>
            </Card>
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Needs</div>
              <div className="os-drawer-stack">
                <div className="os-entity-copy">Permissions: {requiredPermissions.join(', ') || 'None'}</div>
                <div className="os-entity-copy">Secrets: {requiredSecrets.join(', ') || 'None'}</div>
                <div className="os-entity-copy">Skills: {requiredSkills.join(', ') || 'None'}</div>
              </div>
            </Card>
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Version</div>
              <div className="os-drawer-stack">
                <div className="os-entity-copy">Version {detail.manifest.version}</div>
                <div className="os-entity-copy">Health: {detail.healthStatus}</div>
                <div className="os-entity-copy">Last heartbeat: {detail.lastHeartbeatAt ? new Date(detail.lastHeartbeatAt).toLocaleString() : 'None'}</div>
              </div>
            </Card>
            {detail.source === 'external_sdk' && detail.kernelProduct ? (
              <Card>
                <div className="os-entity-title" style={{ marginBottom: 12 }}>Developer</div>
                <div className="os-entity-copy">{detail.kernelProduct}</div>
              </Card>
            ) : null}
          </>
        )}
      </Drawer>

      <Drawer
        open={drawer.current?.id === 'app-install'}
        onClose={drawer.closeDrawer}
        title={detail?.installation ? `${detail.name} installed` : detail?.name ?? 'Install app'}
        description="Review what this app needs before you install or open it."
        routeSafe
        footer={detail ? (
          <div className="os-inline-actions">
            {!detail.installation ? <Button onClick={() => void installCurrent()} disabled={working}>{working ? 'Working...' : 'Approve & Install'}</Button> : null}
            {detail.installation && detail.readiness?.missingPermissions.length ? <Button onClick={() => void approvePermissions()} disabled={working}>{working ? 'Working...' : 'Approve permissions'}</Button> : null}
            {detail.installation && detail.readiness?.ready && platformBadges(detail).includes('Web') ? <Button onClick={() => void openTarget('web')} disabled={working}>{working ? 'Working...' : 'Open App'}</Button> : null}
            {detail.installation ? <Button variant="secondary" onClick={() => void toggleFavorite()} disabled={working}>{detail.installation.favorite ? 'Unfavorite' : 'Favorite'}</Button> : null}
            {detail.installation ? <Button variant="danger" onClick={() => setConfirmRemove(true)} disabled={working}>Remove</Button> : null}
            {detail.readiness?.missingSecrets.length ? <Button href="/library?section=vault" variant="secondary">Add secret</Button> : null}
            {detail.readiness?.missingSkills.length ? <Button href="/library?section=skills" variant="secondary">Install required skill</Button> : null}
          </div>
        ) : undefined}
      >
        {detailLoading ? <LoadingState label="Loading install state" /> : !detail ? (
          <EmptyState title="App unavailable" body="This install record could not be loaded." />
        ) : (
          <>
            <Card>
              <div className="os-inline-actions">
                <Badge tone="accent">{runtimeLabel(detail)}</Badge>
                {state ? <Badge tone={state.tone}>{state.label}</Badge> : null}
                {platformBadges(detail).map(item => <Badge key={item} tone="default">{item}</Badge>)}
              </div>
              <div className="os-drawer-stack" style={{ marginTop: 12 }}>
                <div className="os-entity-copy">Publisher: {detail.publisherName || 'Unknown'}</div>
                <div className="os-entity-copy">Version: {detail.manifest.version}</div>
              </div>
            </Card>
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Install details</div>
              <div className="os-drawer-stack">
                <div className="os-entity-copy">Permissions requested: {requiredPermissions.join(', ') || 'None'}</div>
                {detail.readiness?.missingPermissions.length ? <div className="os-entity-copy">Missing approvals: {detail.readiness.missingPermissions.join(', ')}</div> : null}
                <div className="os-entity-copy">Required secrets: {requiredSecrets.join(', ') || 'None'}</div>
                {detail.readiness?.missingSecrets.length ? <div className="os-entity-copy">Missing secrets: {detail.readiness.missingSecrets.join(', ')}</div> : null}
                <div className="os-entity-copy">Required skills: {requiredSkills.join(', ') || 'None'}</div>
                {detail.readiness?.missingSkills.length ? <div className="os-entity-copy">Missing skills: {detail.readiness.missingSkills.join(', ')}</div> : null}
              </div>
            </Card>
            {notice ? <Card><div className="os-entity-copy">{notice}</div></Card> : null}
          </>
        )}
      </Drawer>

      {detail ? (
        <ConfirmModal
          open={confirmRemove}
          onClose={() => setConfirmRemove(false)}
          title={`Remove ${detail.name}?`}
          body="This removes the current installation."
          confirmLabel="Remove"
          tone="danger"
          busy={working}
          onConfirm={() => void removeCurrent()}
        />
      ) : null}
    </>
  );
}
