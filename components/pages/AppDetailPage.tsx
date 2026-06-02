'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  MetricCard,
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
  installedVersion?: string | null;
  updateAvailable?: boolean;
  status?: 'active' | 'disabled' | 'removed';
};

type AppReadiness = {
  installation: Installation | null;
  requiredPermissions: string[];
  missingPermissions: string[];
  missingSecrets: string[];
  missingSkills: string[];
  ready: boolean;
  updateAvailable: boolean;
  targets: Array<{ target: AppOpenTarget; url: string }>;
};

type AppOpenTarget = 'web' | 'android' | 'ios';

function runtimeLabel(app: AppDetails | null): string {
  if (!app) return 'App';
  if (app.source === 'external_sdk') return 'External SDK';
  if (app.runtimeType === 'workspace-app') return 'Workspace App';
  return 'Internal App';
}

function formatTargets(values: string[]): string {
  return values.join(' / ') || 'AgentOS Cloud';
}

function deriveTargets(app: AppDetails | null): Array<'web' | 'android' | 'ios'> {
  if (!app) return [];
  const targets: Array<'web' | 'android' | 'ios'> = [];
  if (app.distribution.webUrl || app.appUrl) targets.push('web');
  if (app.distribution.androidUrl) targets.push('android');
  if (app.distribution.iosUrl) targets.push('ios');
  return targets;
}

function getReadinessBadge(readiness: AppReadiness | null, installation: Installation | null): { label: string; tone: 'default' | 'accent' | 'success' | 'warning' | 'danger' } | null {
  if (!installation) return null;
  if (installation.status === 'disabled') return { label: 'Disabled', tone: 'warning' };
  if (readiness?.updateAvailable) return { label: 'Update available', tone: 'accent' };
  if (readiness && !readiness.ready) {
    if (readiness.missingPermissions.length > 0) return { label: 'Needs approval', tone: 'warning' };
    if (readiness.missingSecrets.length > 0) return { label: 'Missing secrets', tone: 'danger' };
    if (readiness.missingSkills.length > 0) return { label: 'Missing skills', tone: 'warning' };
    return { label: 'Not ready', tone: 'warning' };
  }
  return { label: 'Ready', tone: 'success' };
}

export default function AppDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';
  const [tab, setTab] = useState('Overview');
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [app, setApp] = useState<AppDetails | null>(null);
  const [readiness, setReadiness] = useState<AppReadiness | null>(null);
  const [viewerOwnsApp, setViewerOwnsApp] = useState(false);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async (currentSession?: BrowserSession | null, withLoading = true) => {
    if (!slug) return;
    if (withLoading) setLoading(true);
    try {
      const nextSession = currentSession !== undefined ? currentSession : await fetchBrowserSession().catch(() => null);
      const [appRes, readinessRes] = await Promise.all([
        fetch(`/api/apps/${slug}`, { cache: 'no-store' }),
        nextSession ? fetch(`/api/apps/${slug}/readiness`, { cache: 'no-store' }).catch(() => null) : Promise.resolve(null),
      ]);
      const appData = await appRes.json().catch(() => ({}));
      const readinessData = readinessRes?.ok ? await readinessRes.json().catch(() => ({})) : null;

      setSession(nextSession ?? null);
      setApp(appData.app ?? null);
      setViewerOwnsApp(appData.viewerOwnsApp === true);
      setReadiness(readinessData ? {
        installation: readinessData.installation ?? null,
        requiredPermissions: readinessData.requiredPermissions ?? [],
        missingPermissions: readinessData.missingPermissions ?? [],
        missingSecrets: readinessData.missingSecrets ?? [],
        missingSkills: readinessData.missingSkills ?? [],
        ready: readinessData.ready === true,
        updateAvailable: readinessData.updateAvailable === true,
        targets: readinessData.targets ?? [],
      } : null);
    } catch {
      setApp(null);
      setReadiness(null);
      setViewerOwnsApp(false);
    } finally {
      if (withLoading) setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    let active = true;
    async function run() {
      const currentSession = await fetchBrowserSession().catch(() => null);
      if (!active) return;
      await load(currentSession, true);
    }
    void run();
    return () => { active = false; };
  }, [load]);

  const installation = readiness?.installation ?? null;
  const commands = useMemo(() => app?.manifest.commands ?? [], [app]);
  const requiredPermissions = useMemo(
    () => readiness?.requiredPermissions.length
      ? readiness.requiredPermissions
      : app
        ? (app.permissionsRequired.length > 0 ? app.permissionsRequired : app.manifest.permissions)
        : [],
    [app, readiness],
  );
  const requiredSkills = useMemo(
    () => app ? (app.manifest.requiredSkills.length > 0 ? app.manifest.requiredSkills : app.manifest.skills) : [],
    [app],
  );
  const requiredSecrets = useMemo(
    () => app ? (app.requiredSecrets.length > 0 ? app.requiredSecrets : app.manifest.requiredSecrets) : [],
    [app],
  );
  const approvedPermissions = useMemo(
    () => new Set((installation?.permissionsApproved ?? []).map(item => item.toLowerCase())),
    [installation?.permissionsApproved],
  );
  const missingPermissionApprovals = useMemo(
    () => readiness?.missingPermissions ?? requiredPermissions.filter(permission => !approvedPermissions.has(permission.toLowerCase())),
    [approvedPermissions, readiness?.missingPermissions, requiredPermissions],
  );
  const missingSecrets = readiness?.missingSecrets ?? [];
  const missingSkills = readiness?.missingSkills ?? [];
  const currentVersion = app?.manifest.version || '1.0.0';
  const versionHistory = useMemo(
    () => app ? (app.versionHistory.length > 0 ? app.versionHistory : [{
      id: `${app.id}-current`,
      version: currentVersion,
      changeSummary: null,
      createdAt: app.updatedAt,
    }]) : [],
    [app, currentVersion],
  );
  const availableTargets = readiness?.targets.length ? readiness.targets.map(item => item.target) : deriveTargets(app);
  const readinessBadge = getReadinessBadge(readiness, installation);
  const updateAvailable = readiness?.updateAvailable === true || installation?.updateAvailable === true;
  const tabs = useMemo(() => {
    const items = ['Overview', 'Commands', 'Permissions', 'Secrets', 'Health'];
    if (viewerOwnsApp) items.push('Analytics');
    if ((app?.screenshots.length ?? 0) > 0) items.push('Screenshots');
    items.push('Changelog');
    return items;
  }, [app, viewerOwnsApp]);
  const installCta = updateAvailable ? 'Update' : installation ? 'Reinstall' : missingPermissionApprovals.length > 0 ? 'Approve & Install' : 'Install';

  function applyFailureReadiness(payload: Record<string, unknown>) {
    setReadiness(current => current ? {
      ...current,
      missingPermissions: Array.isArray(payload.missingPermissions) ? payload.missingPermissions.filter((item): item is string => typeof item === 'string') : current.missingPermissions,
      missingSecrets: Array.isArray(payload.missingSecrets) ? payload.missingSecrets.filter((item): item is string => typeof item === 'string') : current.missingSecrets,
      missingSkills: Array.isArray(payload.missingSkills) ? payload.missingSkills.filter((item): item is string => typeof item === 'string') : current.missingSkills,
      requiredPermissions: Array.isArray(payload.requiredPermissions) ? payload.requiredPermissions.filter((item): item is string => typeof item === 'string') : current.requiredPermissions,
      ready: false,
    } : current);
  }

  async function install(permissionsApproved: string[] = requiredPermissions) {
    if (!app) return;
    setInstalling(true);
    setNotice('');
    try {
      const response = await fetch('/api/apps/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: app.slug,
          permissionsApproved,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        applyFailureReadiness(payload);
        setNotice(payload.error ?? payload.message ?? 'Install failed');
        return;
      }
      await load(session, false);
      setNotice(`${updateAvailable ? 'Updated' : installation ? 'Reinstalled' : 'Installed'} ${app.name}.`);
    } finally {
      setInstalling(false);
    }
  }

  async function approvePermissions() {
    if (!app) return;
    if (!installation) {
      await install(requiredPermissions);
      return;
    }
    setWorking(true);
    setNotice('');
    try {
      const response = await fetch(`/api/apps/${app.slug}/installation`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissionsApproved: requiredPermissions }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(payload.error ?? payload.message ?? 'Permission approval failed');
        return;
      }
      await load(session, false);
      setNotice('Permissions approved.');
    } finally {
      setWorking(false);
    }
  }

  async function openApp(target: AppOpenTarget) {
    if (!app || !session) return;
    setWorking(true);
    setNotice('');
    try {
      const response = await fetch(`/api/apps/${app.slug}/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        applyFailureReadiness(payload);
        setNotice(payload.error ?? payload.message ?? 'Open failed');
        return;
      }
      await load(session, false);
      if (typeof payload.openUrl === 'string' && payload.openUrl.length > 0) {
        window.open(payload.openUrl, '_blank', 'noopener,noreferrer');
      }
      setNotice(`Opened ${app.name} on ${target}.`);
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
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(payload.error ?? payload.message ?? 'Uninstall failed');
        return;
      }
      await load(session, false);
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
      const payload = await response.json().catch(() => ({}));
      if (response.ok) {
        await load(session, false);
        setNotice(installation.favorite ? 'Removed pin.' : 'Pinned app.');
      } else {
        setNotice(payload.error ?? payload.message ?? 'Pin update failed');
      }
    } finally {
      setWorking(false);
    }
  }

  async function setInstallStatus(status: 'active' | 'disabled') {
    if (!app || !installation) return;
    setWorking(true);
    try {
      const response = await fetch(`/api/apps/${app.slug}/installation`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) {
        await load(session, false);
        setNotice(status === 'active' ? 'App enabled.' : 'App disabled.');
      } else {
        setNotice(payload.error ?? payload.message ?? 'Status update failed');
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
                { href: '/ffp', label: 'FFP' },
                ...(session?.capabilities?.includes('access_developer_console') ? [{ href: '/developer', label: 'Developer' }] : []),
                { href: '/vault', label: 'Vault' },
                { href: '/skills', label: 'Skills' },
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
                {readinessBadge ? <Badge tone={readinessBadge.tone}>{readinessBadge.label}</Badge> : null}
                <div className="os-entity-copy">{app.category}</div>
                <div className="os-entity-copy">Publisher: {app.publisherName || 'Unknown publisher'}</div>
                <div className="os-entity-copy">Version: {currentVersion}</div>
                <div className="os-entity-copy">Targets: {formatTargets(app.deviceTargets)}</div>
                <div className="os-entity-copy">Web: {app.distribution.webUrl ? <a href={app.distribution.webUrl} target="_blank" rel="noreferrer">{app.distribution.webUrl}</a> : 'Not published'}</div>
                <div className="os-entity-copy">Android: {app.distribution.androidUrl ? <a href={app.distribution.androidUrl} target="_blank" rel="noreferrer">{app.distribution.androidUrl}</a> : 'Not published'}</div>
                <div className="os-entity-copy">iOS: {app.distribution.iosUrl ? <a href={app.distribution.iosUrl} target="_blank" rel="noreferrer">{app.distribution.iosUrl}</a> : 'Not published'}</div>
                <Button href={`/api/apps/${app.slug}/download`} variant="secondary">Download package</Button>
                {installation ? (
                  <>
                    {availableTargets.includes('web') ? <Button variant="secondary" onClick={() => void openApp('web')} disabled={working || !readiness?.ready}>Open web</Button> : null}
                    {availableTargets.includes('android') ? <Button variant="secondary" onClick={() => void openApp('android')} disabled={working || !readiness?.ready}>Open Android</Button> : null}
                    {availableTargets.includes('ios') ? <Button variant="secondary" onClick={() => void openApp('ios')} disabled={working || !readiness?.ready}>Open iOS</Button> : null}
                  </>
                ) : null}
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
                  {readinessBadge ? <Badge tone={readinessBadge.tone}>{readinessBadge.label}</Badge> : null}
                  {installation ? <Button onClick={() => void openApp('web')} disabled={working || !availableTargets.includes('web') || !readiness?.ready}>{working ? 'Opening...' : 'Open'}</Button> : <Button onClick={() => void install()} disabled={installing}>{installing ? 'Installing...' : installCta}</Button>}
                  {updateAvailable ? <Button variant="secondary" onClick={() => void install()} disabled={installing}>{installing ? 'Updating...' : 'Update'}</Button> : null}
                  {installation ? (
                    <Button variant="secondary" onClick={() => void setInstallStatus(installation.status === 'disabled' ? 'active' : 'disabled')} disabled={working}>
                      {working ? 'Working...' : installation.status === 'disabled' ? 'Enable' : 'Disable'}
                    </Button>
                  ) : null}
                  {installation ? <Button variant="secondary" onClick={() => void uninstallApp()} disabled={working}>{working ? 'Working...' : 'Uninstall'}</Button> : null}
                  {installation ? <Button variant="secondary" onClick={() => void toggleFavorite()} disabled={working}>{installation.favorite === true ? 'Unpin' : 'Pin'}</Button> : null}
                </>
              )}
            />

            <Card>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <Badge tone="default">{app.installCount.toLocaleString()} installs</Badge>
                <Badge tone="default">{app.publisherName || 'Unknown publisher'}</Badge>
                <Badge tone="default">Updated {new Date(app.updatedAt).toLocaleDateString()}</Badge>
                <Badge tone="default">Version {currentVersion}</Badge>
                {installation ? <Badge tone="accent">Installed {installation.installedVersion || currentVersion}</Badge> : null}
              </div>
              {notice ? <div className="os-entity-copy" style={{ marginBottom: 12 }}>{notice}</div> : null}
              <Tabs tabs={tabs.map(item => ({ key: item, label: item }))} active={tab} onChange={setTab} />
            </Card>

            {tab === 'Overview' ? (
              <div style={{ display: 'grid', gap: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                  <MetricCard label="Health" value={app.healthStatus} />
                  <MetricCard label="Permissions" value={requiredPermissions.length} hint={missingPermissionApprovals.length > 0 ? `${missingPermissionApprovals.length} missing approval` : 'Approved'} />
                  <MetricCard label="Required secrets" value={requiredSecrets.length} hint={missingSecrets.length > 0 ? `${missingSecrets.length} missing` : 'Ready'} />
                  <MetricCard label="Required skills" value={requiredSkills.length} hint={missingSkills.length > 0 ? `${missingSkills.length} missing` : 'Ready'} />
                  <MetricCard label="Targets" value={availableTargets.length} hint={availableTargets.join(' / ') || 'None'} />
                </div>

                <Card>
                  <div className="os-entity-title" style={{ marginBottom: 12 }}>Readiness</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                    <Card>
                      <div className="os-sidebar-title">Publisher</div>
                      <div className="os-entity-copy">{app.publisherName || 'Unknown publisher'}</div>
                    </Card>
                    <Card>
                      <div className="os-sidebar-title">Version</div>
                      <div className="os-entity-copy">{currentVersion}</div>
                    </Card>
                    <Card>
                      <div className="os-sidebar-title">Permissions</div>
                      <div className="os-entity-copy">{requiredPermissions.join(', ') || 'None declared'}</div>
                    </Card>
                    <Card>
                      <div className="os-sidebar-title">Required secrets</div>
                      <div className="os-entity-copy">{requiredSecrets.join(', ') || 'None required'}</div>
                    </Card>
                    <Card>
                      <div className="os-sidebar-title">Required skills</div>
                      <div className="os-entity-copy">{requiredSkills.join(', ') || 'None required'}</div>
                    </Card>
                    <Card>
                      <div className="os-sidebar-title">Device targets</div>
                      <div className="os-entity-copy">{formatTargets(app.deviceTargets)}</div>
                    </Card>
                  </div>
                </Card>

                {missingPermissionApprovals.length > 0 ? (
                  <Card>
                    <div className="os-entity-title" style={{ marginBottom: 8 }}>Permission approval required</div>
                    <div className="os-entity-copy" style={{ marginBottom: 12 }}>
                      Approve: {missingPermissionApprovals.join(', ')}
                    </div>
                    <Button variant="secondary" onClick={() => void approvePermissions()} disabled={working || installing}>
                      {installation ? 'Approve permissions' : 'Approve & Install'}
                    </Button>
                  </Card>
                ) : null}

                {missingSecrets.length > 0 ? (
                  <Card>
                    <div className="os-entity-title" style={{ marginBottom: 8 }}>Vault secrets missing</div>
                    <div className="os-entity-copy" style={{ marginBottom: 12 }}>
                      Missing: {missingSecrets.join(', ')}
                    </div>
                    <Button href="/vault" variant="secondary">Open Vault</Button>
                  </Card>
                ) : null}

                {missingSkills.length > 0 ? (
                  <Card>
                    <div className="os-entity-title" style={{ marginBottom: 8 }}>Skills missing</div>
                    <div className="os-entity-copy" style={{ marginBottom: 12 }}>
                      Missing: {missingSkills.join(', ')}
                    </div>
                    <Button href="/skills" variant="secondary">Open Skills</Button>
                  </Card>
                ) : null}

                <Card>
                  <div className="os-entity-copy" style={{ marginBottom: 16 }}>{app.longDescription || app.description}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                    <Card>
                      <div className="os-sidebar-title">Runtime</div>
                      <div className="os-entity-title">{runtimeLabel(app)}</div>
                    </Card>
                    <Card>
                      <div className="os-sidebar-title">Entrypoint</div>
                      <div className="os-entity-copy">{app.manifest.entrypoint}</div>
                    </Card>
                    <Card>
                      <div className="os-sidebar-title">Health</div>
                      <div className="os-entity-copy">{app.healthStatus}</div>
                    </Card>
                    <Card>
                      <div className="os-sidebar-title">Open targets</div>
                      <div className="os-entity-copy">{availableTargets.join(', ') || 'No targets published'}</div>
                    </Card>
                  </div>
                </Card>
              </div>
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
                  <PermissionCard
                    key={permission}
                    title={permission}
                    description={missingPermissionApprovals.includes(permission)
                      ? 'Approval is still required before this app can run.'
                      : 'Visible before install so workspace owners can review the access scope.'}
                    required={permission !== 'No special permissions declared'}
                  />
                ))}
              </div>
            ) : null}

            {tab === 'Secrets' ? (
              <div style={{ display: 'grid', gap: 12 }}>
                {(requiredSecrets.length > 0 ? requiredSecrets : ['No required secrets']).map(secret => (
                  <PermissionCard
                    key={secret}
                    title={secret}
                    description={missingSecrets.includes(secret)
                      ? 'Assign this secret in Vault before the app can run.'
                      : 'Assigned or not required for the current installation.'}
                    required={secret !== 'No required secrets'}
                  />
                ))}
              </div>
            ) : null}

            {tab === 'Health' ? (
              <Card>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  <Card>
                    <div className="os-sidebar-title">Health status</div>
                    <div className="os-entity-copy">{app.healthStatus}</div>
                  </Card>
                  <Card>
                    <div className="os-sidebar-title">Heartbeat count</div>
                    <div className="os-entity-copy">{app.heartbeatCount}</div>
                  </Card>
                  <Card>
                    <div className="os-sidebar-title">Last heartbeat</div>
                    <div className="os-entity-copy">{app.lastHeartbeatAt ? new Date(app.lastHeartbeatAt).toLocaleString() : 'None recorded'}</div>
                  </Card>
                  <Card>
                    <div className="os-sidebar-title">Last command</div>
                    <div className="os-entity-copy">{app.lastCommandAt ? new Date(app.lastCommandAt).toLocaleString() : 'None recorded'}</div>
                  </Card>
                </div>
                {app.lastError ? <div className="os-entity-copy" style={{ marginTop: 16 }}>Last error: {app.lastError}</div> : null}
              </Card>
            ) : null}

            {tab === 'Analytics' ? (
              <Card>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                  <MetricCard label="Installs" value={app.installCount} />
                  <MetricCard label="Opens" value={app.openCount} />
                  <MetricCard label="Web opens" value={app.webOpenCount} />
                  <MetricCard label="Android opens" value={app.androidDownloadCount} />
                  <MetricCard label="iOS opens" value={app.iosDownloadCount} />
                  <MetricCard label="Heartbeats" value={app.heartbeatCount} />
                </div>
              </Card>
            ) : null}

            {tab === 'Screenshots' ? (
              app.screenshots.length === 0 ? <EmptyState title="No screenshots" body="This app has not published screenshots." /> : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {app.screenshots.map(path => (
                    <Card key={path}>
                      <a href={path} target="_blank" rel="noreferrer" className="os-entity-copy">{path}</a>
                    </Card>
                  ))}
                </div>
              )
            ) : null}

            {tab === 'Changelog' ? (
              <div style={{ display: 'grid', gap: 12 }}>
                {versionHistory.map(entry => (
                  <Card key={entry.id}>
                    <div className="os-entity-title" style={{ marginBottom: 8 }}>Version {entry.version}</div>
                    <div className="os-entity-copy" style={{ marginBottom: 8 }}>
                      {entry.changeSummary || 'Version record published without release notes.'}
                    </div>
                    <div className="os-entity-meta">{new Date(entry.createdAt).toLocaleString()}</div>
                  </Card>
                ))}
              </div>
            ) : null}
          </>
        )}
      </AppShell>
    </div>
  );
}
