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
  DataTable,
  EmptyState,
  FilterChips,
  LoadingState,
  PageHeader,
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
  projects: ProjectItem[];
  favorites: ProjectItem[];
  chart: Array<{ label: string; value: number }>;
};

const TABS = ['Recent', 'Pinned', 'All'];

export default function ProjectsPage() {
  const [payload, setPayload] = useState<ProjectsPayload | null>(null);
  const [authState, setAuthState] = useState<BrowserSessionAuthState>('signed_out');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('Recent');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sessionState = await fetchBrowserSessionState().catch(() => ({ state: 'signed_out' as const, session: null }));
      setAuthState(sessionState.state);
      if (!sessionState.session) {
        setPayload(null);
        return;
      }
      const url = `/api/projects?type=all&search=${encodeURIComponent(search)}`;
      const { response, authState: nextAuthState } = await fetchWithBrowserSession(url, { cache: 'no-store' });
      setAuthState(nextAuthState);
      const data = await response.json();
      setPayload(response.ok ? data : null);
    } catch {
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo(() => {
    if (!payload) return [];
    if (tab === 'Pinned') return payload.favorites ?? [];
    return payload.projects ?? [];
  }, [payload, tab]);

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/projects" />
      <WorkspaceShell
        activePath="/projects"
        aside={(
          <>
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 10 }}>Pinned</div>
              {payload?.favorites?.length ? (
                <ActivityFeed items={payload.favorites.map(item => ({
                  id: item.id,
                  title: item.name,
                  subtitle: item.kind,
                  time: new Date(item.updatedAt).toLocaleDateString(),
                }))} />
              ) : (
                <div className="os-empty-body">No pinned projects.</div>
              )}
            </Card>
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 10 }}>Recent</div>
              <ActivityFeed
                items={(payload?.chart ?? []).slice(-5).map((item, index) => ({
                  id: `${item.label}-${index}`,
                  title: item.label,
                  subtitle: `${item.value} updates`,
                }))}
              />
            </Card>
          </>
        )}
      >
        <PageHeader
          eyebrow="Projects"
          title="Projects"
          subtitle="Projects list, search, recent work, pinned context, and creation."
          actions={<Button href="/studio?mode=nl&prompt=Create%20a%20project">Create Project</Button>}
        />

        <SearchBar value={search} onChange={event => setSearch(event.target.value)} placeholder="Search projects" />
        <FilterChips items={TABS} active={tab} onChange={setTab} />

        {loading ? <LoadingState label="Loading projects" /> : !payload ? (
          authState === 'expired'
            ? <EmptyState title="Session expired" body="Sign in again to inspect workspace projects." action={<Button href="/signin">Sign in again</Button>} />
            : <EmptyState title="Sign in required" body="Sign in to inspect workspace projects." action={<Button href="/signin">Sign in</Button>} />
        ) : items.length === 0 ? (
          <EmptyState title="No projects found" body="Create or pin a project to populate this list." action={<Button href="/studio?mode=nl&prompt=Create%20a%20project">Create Project</Button>} />
        ) : (
          <DataTable
            columns={['Project', 'Kind', 'Status', 'Runs', 'Users', 'Updated', '']}
            rows={items.map(item => [
              <div key={`${item.id}-project`}>
                <div className="os-entity-title">{item.name}</div>
                <div className="os-entity-copy">{item.description}</div>
              </div>,
              item.kind,
              item.status,
              String(item.runs),
              String(item.users),
              new Date(item.updatedAt).toLocaleDateString(),
              <Link key={`${item.id}-open`} href={item.href} className="btn-ghost">Open</Link>,
            ])}
          />
        )}
      </WorkspaceShell>
    </div>
  );
}
