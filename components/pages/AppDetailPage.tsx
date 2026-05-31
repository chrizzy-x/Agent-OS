'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Nav from '@/components/Nav';
import type { AgentAppListing } from '@/src/appstore/catalog';
import { fetchBrowserSession } from '@/src/auth/browser-session';
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
  const [app, setApp] = useState<AppDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/apps/${slug}`, { cache: 'no-store' });
        const data = await res.json();
        if (active) setApp(data.app ?? null);
      } catch {
        if (active) setApp(null);
      } finally {
        if (active) setLoading(false);
      }
    }
    if (slug) void load();
    return () => { active = false; };
  }, [slug]);

  const commands = useMemo(
    () => app?.manifest.commands ?? [],
    [app],
  );

  async function install() {
    if (!app) return;
    setInstalling(true);
    try {
      const session = await fetchBrowserSession();
      if (!session) return;
      await fetch('/api/apps/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: app.slug }),
      });
    } finally {
      setInstalling(false);
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
                { href: '/developer', label: 'Developer' },
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
                <div className="os-entity-copy">{app.category}</div>
                <div className="os-entity-copy">{app.deviceTargets.join(' • ') || 'AgentOS Cloud'}</div>
                <Link href={`/api/apps/${app.slug}/download`} className="btn-outline">Download package</Link>
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
                  <Button onClick={() => void install()}>{installing ? 'Installing...' : 'Install'}</Button>
                  <Link href={`/api/apps/${app.slug}/download`} className="btn-outline">Download</Link>
                </>
              )}
            />

            <Card>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <Badge tone="default">{app.installCount.toLocaleString()} installs</Badge>
                <Badge tone="default">{app.publisherName || 'AgentOS Publisher'}</Badge>
                <Badge tone="default">Updated {new Date(app.updatedAt).toLocaleDateString()}</Badge>
              </div>
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
                {(app.permissionsRequired.length > 0 ? app.permissionsRequired : ['No special permissions declared']).map(permission => (
                  <PermissionCard key={permission} title={permission} description="Visible before install so workspace owners can review access scope." required />
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
