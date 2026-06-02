'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import type { AgentAppListing } from '@/src/appstore/catalog';
import {
  AppShell,
  AppCard,
  Badge,
  Button,
  Card,
  EmptyState,
  FilterChips,
  LoadingState,
  PageHeader,
  SearchBar,
  SidebarNav,
  SidebarSection,
  StatusPill,
} from '@/components/os/ui';

const CATEGORY_CHIPS = ['All', 'Featured', 'Popular', 'New', 'External SDK', 'Internal Apps', 'Skills', 'Finance', 'Productivity', 'Dev Tools', 'Data', 'Research'];
const RUNTIME_FILTERS = ['all', 'external-app', 'agentos-app', 'workspace-app'];

type InstalledAppCard = AgentAppListing & {
  installation?: {
    favorite?: boolean;
    installedVersion?: string | null;
    status?: 'active' | 'disabled' | 'removed';
  };
  readiness?: {
    requiredPermissions: string[];
    missingPermissions: string[];
    missingSecrets: string[];
    missingSkills: string[];
    ready: boolean;
    updateAvailable: boolean;
    targets: Array<{ target: 'web' | 'android' | 'ios'; url: string }>;
  };
};

function runtimeLabel(app: AgentAppListing): string {
  if (app.source === 'external_sdk') return 'External SDK';
  if (app.runtimeType === 'workspace-app') return 'Workspace App';
  if (app.runtimeType === 'external-app') return 'External SDK';
  return 'Internal App';
}

function matchCategory(app: AgentAppListing, category: string): boolean {
  if (category === 'All') return true;
  if (category === 'Featured') return app.verified;
  if (category === 'Popular') return app.installCount > 0;
  if (category === 'New') return true;
  if (category === 'External SDK') return app.source === 'external_sdk';
  if (category === 'Internal Apps') return app.source === 'internal';
  return `${app.category} ${app.description}`.toLowerCase().includes(category.toLowerCase());
}

function getInstalledState(app: InstalledAppCard | null | undefined): { label: string; tone: 'default' | 'accent' | 'success' | 'warning' | 'danger' } | null {
  if (!app?.installation) return null;
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

function getInstalledSummary(app: InstalledAppCard): string {
  const state = getInstalledState(app);
  if (!state) return runtimeLabel(app);
  return `${runtimeLabel(app)} - ${state.label.toLowerCase()}`;
}

export default function AppstorePage() {
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [apps, setApps] = useState<AgentAppListing[]>([]);
  const [installedApps, setInstalledApps] = useState<InstalledAppCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [runtimeType, setRuntimeType] = useState('all');

  const load = useCallback(async () => {
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
        const installedRes = await fetch('/api/apps/installed', { cache: 'no-store' });
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => apps.filter(app => {
      const matchesSearch = !search || `${app.name} ${app.description} ${app.category}`.toLowerCase().includes(search.toLowerCase());
      const matchesRuntime = runtimeType === 'all' || app.runtimeType === runtimeType;
      return matchesSearch && matchesRuntime && matchCategory(app, category);
    }),
    [apps, category, runtimeType, search],
  );

  const installedBySlug = useMemo(
    () => new Map(installedApps.map(app => [app.slug, app])),
    [installedApps],
  );
  const featured = filtered.filter(app => app.verified || app.source === 'external_sdk').slice(0, 3);
  const trending = filtered.slice(0, 5);

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/appstore" />
      <AppShell
        activePath="/appstore"
        sidebar={(
          <>
            <SidebarSection title="Explore">
              <SidebarNav
                items={[
                  { href: '/studio', label: 'Studio' },
                  { href: '/appstore', label: 'Appstore', active: true },
                  { href: '/ffp', label: 'FFP' },
                  ...(session?.capabilities?.includes('access_developer_console') ? [{ href: '/developer', label: 'Developer' }] : []),
                  { href: '/projects', label: 'Projects' },
                  { href: '/workflows', label: 'Workflows' },
                  { href: '/vault', label: 'Vault' },
                  { href: '/skills', label: 'Skills' },
                  { href: '/analytics', label: 'Analytics' },
                  { href: '/settings', label: 'Settings' },
                ]}
              />
            </SidebarSection>
            <SidebarSection title="Categories">
              <FilterChips items={CATEGORY_CHIPS} active={category} onChange={setCategory} />
            </SidebarSection>
          </>
        )}
        aside={(
          <>
            <SidebarSection title="Filters">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {RUNTIME_FILTERS.map(item => (
                  <button key={item} type="button" className={`os-chip${runtimeType === item ? ' active' : ''}`} onClick={() => setRuntimeType(item)}>
                    {item === 'all' ? 'All runtimes' : item === 'external-app' ? 'External SDK' : item === 'agentos-app' ? 'Internal App' : 'Workspace App'}
                  </button>
                ))}
              </div>
            </SidebarSection>
            <SidebarSection title="Installed apps">
              {installedApps.length === 0 ? (
                <div className="os-empty-body">No installed apps yet.</div>
              ) : (
                <SidebarNav items={installedApps.slice(0, 6).map(app => ({
                  href: `/appstore/${app.slug}`,
                  label: app.name,
                  subtitle: getInstalledSummary(app),
                  badge: app.installation?.favorite ? 'Pinned' : undefined,
                }))} />
              )}
            </SidebarSection>
            <SidebarSection title="Trending this week">
              <SidebarNav items={trending.map(app => ({
                href: `/appstore/${app.slug}`,
                label: app.name,
                subtitle: `${app.installCount.toLocaleString()} installs`,
              }))} />
            </SidebarSection>
          </>
        )}
      >
        <PageHeader
          eyebrow="AgentOS Appstore"
          title="Appstore"
          subtitle="Public listings come only from real SDK registrations, published AgentOS apps, and official system apps."
          actions={session?.capabilities?.includes('create_app') ? <Button href="/publishing/new" variant="secondary">Publish app</Button> : undefined}
        />

        <SearchBar value={search} onChange={event => setSearch(event.target.value)} placeholder="Search apps, SDK tools, finance, research, data..." />
        <FilterChips items={CATEGORY_CHIPS} active={category} onChange={setCategory} />

        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            {[0, 1, 2].map(item => <LoadingState key={item} label="Loading app listings" />)}
          </div>
        ) : featured.length === 0 && filtered.length === 0 ? (
          <EmptyState title="No public apps yet" body="Public listings appear here automatically for validated SDK apps and published AgentOS releases." />
        ) : (
          <>
            {session ? (
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                  <div>
                    <div className="os-entity-title">Installed apps</div>
                    <div className="os-entity-copy">Readiness, pending approvals, missing secrets, and update state stay visible here.</div>
                  </div>
                  <Badge tone="accent">{installedApps.length} installed</Badge>
                </div>
                {installedApps.length === 0 ? (
                  <div className="os-empty-body">No installed apps yet.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                    {installedApps.slice(0, 6).map(app => {
                      const state = getInstalledState(app);
                      return (
                        <AppCard
                          key={app.id}
                          href={`/appstore/${app.slug}`}
                          title={app.name}
                          description={app.description}
                          runtime={runtimeLabel(app)}
                          verified={app.verified}
                          installs={app.installCount}
                          badge={state ? <Badge tone={state.tone}>{state.label}</Badge> : undefined}
                          footer={(
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                              <span className="os-entity-meta">
                                {app.readiness?.missingSecrets.length
                                  ? `${app.readiness.missingSecrets.length} secret issue${app.readiness.missingSecrets.length === 1 ? '' : 's'}`
                                  : app.readiness?.missingSkills.length
                                    ? `${app.readiness.missingSkills.length} skill issue${app.readiness.missingSkills.length === 1 ? '' : 's'}`
                                    : app.readiness?.missingPermissions.length
                                      ? `${app.readiness.missingPermissions.length} approval issue${app.readiness.missingPermissions.length === 1 ? '' : 's'}`
                                      : app.readiness?.targets.map(item => item.target).join(' / ') || 'AgentOS Cloud'}
                              </span>
                              <Button href={`/appstore/${app.slug}`} variant="primary">
                                {app.readiness?.updateAvailable ? 'Update' : 'Open'}
                              </Button>
                            </div>
                          )}
                        />
                      );
                    })}
                  </div>
                )}
              </Card>
            ) : null}

            <Card>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                <div>
                  <div className="os-entity-title">Featured apps</div>
                  <div className="os-entity-copy">Verified releases and SDK apps that completed registration and indexing.</div>
                </div>
                <Badge tone="accent">{filtered.length} public apps</Badge>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                {featured.map(app => {
                  const installed = installedBySlug.get(app.slug);
                  const state = getInstalledState(installed);
                  return (
                    <AppCard
                      key={app.id}
                      href={`/appstore/${app.slug}`}
                      title={app.name}
                      description={app.description}
                      runtime={runtimeLabel(app)}
                      verified={app.verified}
                      installs={app.installCount}
                      badge={app.source === 'external_sdk'
                        ? <Badge tone="accent">Auto-discovered via AgentOS SDK</Badge>
                        : state
                          ? <Badge tone={state.tone}>{state.label}</Badge>
                          : undefined}
                      footer={(
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          {installed ? <Badge tone={state?.tone ?? 'default'}>{state?.label ?? 'Installed'}</Badge> : <StatusPill status={app.visibility} />}
                          <Button href={`/appstore/${app.slug}`} variant="primary">
                            {installed?.readiness?.updateAvailable ? 'Update' : installed ? 'Open' : 'Install'}
                          </Button>
                        </div>
                      )}
                    />
                  );
                })}
              </div>
            </Card>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
              {filtered.map(app => {
                const installed = installedBySlug.get(app.slug);
                const state = getInstalledState(installed);
                return (
                  <AppCard
                    key={app.id}
                    href={`/appstore/${app.slug}`}
                    title={app.name}
                    description={app.description}
                    runtime={runtimeLabel(app)}
                    verified={app.verified}
                    installs={app.installCount}
                    badge={app.source === 'external_sdk'
                      ? <Badge tone="accent">Auto-discovered via AgentOS SDK</Badge>
                      : state
                        ? <Badge tone={state.tone}>{state.label}</Badge>
                        : undefined}
                    footer={(
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <span className="os-entity-meta">
                          {installed?.readiness?.updateAvailable
                            ? `Installed ${installed.installation?.installedVersion ?? 'older'} -> ${app.manifest.version}`
                            : installed?.readiness && !installed.readiness.ready
                              ? [
                                installed.readiness.missingPermissions.length > 0 ? 'Needs approval' : null,
                                installed.readiness.missingSecrets.length > 0 ? 'Missing secrets' : null,
                                installed.readiness.missingSkills.length > 0 ? 'Missing skills' : null,
                              ].filter(Boolean).join(' | ') || 'Not ready'
                              : app.deviceTargets.slice(0, 2).join(' / ') || 'AgentOS Cloud'}
                        </span>
                        <Button href={`/appstore/${app.slug}`}>
                          {installed?.readiness?.updateAvailable ? 'Update' : installed ? 'Open' : 'Install'}
                        </Button>
                      </div>
                    )}
                  />
                );
              })}
            </div>
          </>
        )}

        <nav
          aria-label="Mobile navigation"
          style={{
            position: 'sticky',
            bottom: 16,
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 8,
            padding: 8,
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'rgba(17, 17, 22, 0.95)',
          }}
        >
          <Link href="/studio" className="os-chip" style={{ textDecoration: 'none', justifyContent: 'center' }}>Studio</Link>
          <Link href="/appstore" className="os-chip active" style={{ textDecoration: 'none', justifyContent: 'center' }}>Apps</Link>
          <Link href="/ffp" className="os-chip" style={{ textDecoration: 'none', justifyContent: 'center' }}>FFP</Link>
          <Link href="/subagents" className="os-chip" style={{ textDecoration: 'none', justifyContent: 'center' }}>Agents</Link>
          <Link href="/settings" className="os-chip" style={{ textDecoration: 'none', justifyContent: 'center' }}>Settings</Link>
        </nav>
      </AppShell>
    </div>
  );
}
