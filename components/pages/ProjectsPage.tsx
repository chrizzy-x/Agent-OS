'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import { fetchBrowserSessionState, fetchWithBrowserSession, type BrowserSessionAuthState } from '@/src/auth/browser-session';
import {
  ActivityFeed,
  Button,
  Card,
  EmptyState,
  FilterChips,
  LoadingState,
  MetricCard,
  PageHeader,
  ProjectCard,
  SearchBar,
} from '@/components/os/ui';

type ProjectItem = {
  id: string;
  kind: string;
  name: string;
  description: string;
  status: string;
  visibility: string;
  updatedAt: string;
  runs: number;
  users: number;
  href: string;
};

type ProjectsPayload = {
  summary: {
    totalProjects: number;
    activeProjects: number;
    totalRuns: number;
    totalInstalls: number;
    totalUsers: number;
  };
  projects: ProjectItem[];
  favorites: ProjectItem[];
  chart: Array<{ label: string; value: number }>;
};

const TABS = ['All', 'Apps', 'Workflows', 'Agents', 'Skills', 'Datasets'];

function tabToKind(tab: string): string {
  if (tab === 'All') return 'all';
  if (tab === 'Apps') return 'app';
  if (tab === 'Workflows') return 'workflow';
  if (tab === 'Agents') return 'agent';
  if (tab === 'Skills') return 'skill';
  if (tab === 'Datasets') return 'dataset';
  return 'all';
}

export default function ProjectsPage() {
  const [payload, setPayload] = useState<ProjectsPayload | null>(null);
  const [authState, setAuthState] = useState<BrowserSessionAuthState>('signed_out');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('All');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sessionState = await fetchBrowserSessionState().catch(() => ({ state: 'signed_out' as const, session: null }));
      setAuthState(sessionState.state);
      if (!sessionState.session) {
        setPayload(null);
        return;
      }
      const kind = tabToKind(tab);
      const url = `/api/projects?type=${kind}&search=${encodeURIComponent(search)}`;
      const { response, authState: nextAuthState } = await fetchWithBrowserSession(url, { cache: 'no-store' });
      setAuthState(nextAuthState);
      const res = response;
      const data = await res.json();
      setPayload(res.ok ? data : null);
    } catch {
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [search, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo(() => payload?.projects ?? [], [payload]);

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/projects" />
      <WorkspaceShell
        activePath="/projects"
        aside={(
          <>
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>View</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button type="button" className={`os-chip${view === 'grid' ? ' active' : ''}`} onClick={() => setView('grid')}>Grid</button>
                <button type="button" className={`os-chip${view === 'list' ? ' active' : ''}`} onClick={() => setView('list')}>List</button>
              </div>
            </Card>
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Favorites</div>
              {payload?.favorites?.length ? (
                <ActivityFeed items={payload.favorites.map(item => ({
                  id: item.id,
                  title: item.name,
                  subtitle: item.kind,
                  time: new Date(item.updatedAt).toLocaleDateString(),
                }))} />
              ) : (
                <div className="os-empty-body">No favorites yet.</div>
              )}
            </Card>
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Activity</div>
              <ActivityFeed
                items={(payload?.chart ?? []).slice(-5).map((item, index) => ({
                  id: `${item.label}-${index}`,
                  title: item.label,
                  subtitle: `${item.value} workflow updates`,
                }))}
              />
            </Card>
          </>
        )}
      >
        <PageHeader
          eyebrow="Projects"
          title="Projects"
          subtitle="A workspace collection view for apps, workflows, agents, and skills."
          actions={(
            <>
              <Button href="/onboarding" variant="secondary">Import</Button>
              <Button href="/workflows">New Project</Button>
            </>
          )}
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <MetricCard label="Total projects" value={payload?.summary.totalProjects ?? '—'} />
          <MetricCard label="Active projects" value={payload?.summary.activeProjects ?? '—'} />
          <MetricCard label="Total runs" value={payload?.summary.totalRuns ?? '—'} />
          <MetricCard label="Total installs" value={payload?.summary.totalInstalls ?? '—'} />
          <MetricCard label="Total users" value={payload?.summary.totalUsers ?? '—'} />
        </div>

        <SearchBar value={search} onChange={event => setSearch(event.target.value)} placeholder="Search projects, apps, workflows, skills..." />
        <FilterChips items={TABS} active={tab} onChange={setTab} />

        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            {[0, 1, 2].map(item => <LoadingState key={item} label="Loading projects" />)}
          </div>
        ) : !payload ? (
          authState === 'expired'
            ? <EmptyState title="Session expired" body="Sign in again to inspect workspace projects." action={<Button href="/signin">Sign in again</Button>} />
            : <EmptyState title="Sign in required" body="Sign in to inspect workspace projects." action={<Button href="/signin">Sign in</Button>} />
        ) : items.length === 0 ? (
          <EmptyState title="No projects yet" body="Create a workflow, app, or skill to populate this workspace." action={<Button href="/studio">Open Studio</Button>} />
        ) : view === 'grid' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            {items.map(item => (
              <ProjectCard
                key={item.id}
                title={item.name}
                description={item.description}
                status={item.status}
                kind={item.kind}
                footer={(
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span className="os-entity-meta">{new Date(item.updatedAt).toLocaleDateString()}</span>
                    <Link href={item.href} className="btn-primary">Open</Link>
                  </div>
                )}
              />
            ))}
          </div>
        ) : (
          <Card>
            <div style={{ display: 'grid', gap: 10 }}>
              {items.map(item => (
                <Link key={item.id} href={item.href} style={{ textDecoration: 'none' }}>
                  <Card>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div>
                        <div className="os-entity-title">{item.name}</div>
                        <div className="os-entity-copy">{item.description}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span className="os-entity-meta">{item.kind}</span>
                        <span className="os-entity-meta">{item.runs} runs</span>
                        <span className="os-entity-meta">{item.users} users</span>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </Card>
        )}
      </WorkspaceShell>
    </div>
  );
}
