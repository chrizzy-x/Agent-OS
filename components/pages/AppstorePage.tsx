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

export default function AppstorePage() {
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [apps, setApps] = useState<AgentAppListing[]>([]);
  const [installedApps, setInstalledApps] = useState<AgentAppListing[]>([]);
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
                  subtitle: runtimeLabel(app),
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
          subtitle="Discover powerful apps, skills, and SDK-backed tools for your agents."
          actions={session?.capabilities?.includes('create_app') ? <Button href="/publishing/new" variant="secondary">Publish app</Button> : undefined}
        />

        <SearchBar value={search} onChange={event => setSearch(event.target.value)} placeholder="Search apps, SDK tools, finance, research, data..." />

        <FilterChips items={CATEGORY_CHIPS} active={category} onChange={setCategory} />

        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            {[0, 1, 2].map(item => <LoadingState key={item} label="Loading app listings" />)}
          </div>
        ) : featured.length === 0 && filtered.length === 0 ? (
          <EmptyState title="No public apps yet" body="Public listings appear here automatically for SDK apps and when internal publishers switch visibility to public." />
        ) : (
          <>
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                <div>
                  <div className="os-entity-title">Featured apps</div>
                  <div className="os-entity-copy">Auto-discovered SDK apps and verified internal releases.</div>
                </div>
                <Badge tone="accent">{filtered.length} public apps</Badge>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                {featured.map(app => (
                  <AppCard
                    key={app.id}
                    href={`/appstore/${app.slug}`}
                    title={app.name}
                    description={app.description}
                    runtime={runtimeLabel(app)}
                    verified={app.verified}
                    installs={app.installCount}
                    badge={app.source === 'external_sdk' ? <Badge tone="accent">Auto-discovered via AgentOS SDK</Badge> : undefined}
                    footer={(
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <StatusPill status={app.visibility} />
                        <Button href={`/appstore/${app.slug}`} variant="primary">{installedApps.some(installed => installed.slug === app.slug) ? 'Open' : 'Install'}</Button>
                      </div>
                    )}
                  />
                ))}
              </div>
            </Card>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
              {filtered.map(app => (
                <AppCard
                  key={app.id}
                  href={`/appstore/${app.slug}`}
                  title={app.name}
                  description={app.description}
                  runtime={runtimeLabel(app)}
                  verified={app.verified}
                  installs={app.installCount}
                  rating={4.5}
                  badge={app.source === 'external_sdk' ? <Badge tone="accent">Auto-discovered via AgentOS SDK</Badge> : undefined}
                  footer={(
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span className="os-entity-meta">{app.deviceTargets.slice(0, 2).join(' • ')}</span>
                      <Button href={`/appstore/${app.slug}`}>{installedApps.some(installed => installed.slug === app.slug) ? 'Open' : 'Install'}</Button>
                    </div>
                  )}
                />
              ))}
            </div>
          </>
        )}

        <nav
          aria-label="Mobile navigation"
          style={{
            position: 'sticky',
            bottom: 16,
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 8,
            padding: 8,
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'rgba(17, 17, 22, 0.95)',
          }}
        >
          <Link href="/studio" className="os-chip" style={{ textDecoration: 'none', justifyContent: 'center' }}>Studio</Link>
          <Link href="/appstore" className="os-chip active" style={{ textDecoration: 'none', justifyContent: 'center' }}>Apps</Link>
          <Link href="/subagents" className="os-chip" style={{ textDecoration: 'none', justifyContent: 'center' }}>Agents</Link>
          <Link href="/settings" className="os-chip" style={{ textDecoration: 'none', justifyContent: 'center' }}>Settings</Link>
        </nav>
      </AppShell>
    </div>
  );
}
