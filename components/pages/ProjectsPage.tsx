'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import GlobalSearch from '@/components/os/global-search';
import { useApplicationShell } from '@/components/os/application-shell';
import { fetchBrowserSessionState, fetchWithBrowserSession, type BrowserSessionAuthState } from '@/src/auth/browser-session';
import {
  ActivityFeed,
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  FilterChips,
  LoadingState,
  PageHeader,
  SearchBar,
  Input,
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
  pinned: boolean;
  metadata: Record<string, unknown>;
};

type ProjectsPayload = {
  projects: ProjectItem[];
  favorites: ProjectItem[];
  chart: Array<{ label: string; value: number }>;
};

const TABS = ['Recent', 'Pinned', 'All'];
type ViewMode = 'grid' | 'list';

export default function ProjectsPage() {
  const router = useRouter();
  const shell = useApplicationShell();
  const [payload, setPayload] = useState<ProjectsPayload | null>(null);
  const [authState, setAuthState] = useState<BrowserSessionAuthState>('signed_out');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('Recent');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: '', description: '', template: 'blank' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sessionState = await fetchBrowserSessionState().catch(() => ({ state: 'signed_out' as const, session: null }));
      setAuthState(sessionState.state);
      if (!sessionState.session) {
        setPayload(null);
        return;
      }
      const url = `/api/projects?type=all&search=${encodeURIComponent(search)}${shell.activeWorkspaceId ? `&workspace=${encodeURIComponent(shell.activeWorkspaceId)}` : ''}`;
      const { response, authState: nextAuthState } = await fetchWithBrowserSession(url, { cache: 'no-store' });
      setAuthState(nextAuthState);
      const data = await response.json();
      setPayload(response.ok ? data : null);
    } catch {
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [search, shell.activeWorkspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo(() => {
    if (!payload) return [];
    if (tab === 'Pinned') return payload.favorites ?? [];
    return payload.projects ?? [];
  }, [payload, tab]);

  async function createProject() {
    if (!shell.activeWorkspaceId || !draft.name.trim()) return;
    const response = await fetchWithBrowserSession('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: shell.activeWorkspaceId,
        name: draft.name,
        description: draft.description,
        metadata: { template: draft.template, pinned: false },
      }),
    });
    if (!response.response.ok) return;
    const result = await response.response.json() as { project?: { id: string } };
    await shell.refreshShell();
    if (result.project?.id) {
      const prompt = draft.template === 'blank' ? '' : `&prompt=${encodeURIComponent(`Scaffold the ${draft.template} template for this project`)}`;
      router.push(`/studio?mode=code&project=${encodeURIComponent(result.project.id)}&workspace=${encodeURIComponent(shell.activeWorkspaceId)}${prompt}`);
    }
  }

  async function togglePin(item: ProjectItem) {
    await fetchWithBrowserSession(`/api/projects/${encodeURIComponent(item.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadata: { ...item.metadata, pinned: !item.pinned } }),
    });
    await Promise.all([load(), shell.refreshShell()]);
  }

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
          subtitle="Containers for context, assets, workflows, memory, and files."
          actions={(
            <div className="os-inline-actions">
              <Button onClick={() => setCreating(value => !value)}>Create Project</Button>
              <Button variant="secondary" onClick={() => setCreating(true)}>Import Project</Button>
            </div>
          )}
        />

        {creating ? (
          <Card>
            <div style={{ width: '100%', display: 'grid', gap: 10 }}>
              <Input value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} placeholder="Project name" />
              <Input value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} placeholder="Description" />
              <div className="os-inline-actions" aria-label="Project template">
                {[
                  ['blank', 'Blank'],
                  ['research', 'Research'],
                  ['automation', 'Automation'],
                ].map(([key, label]) => (
                  <button key={key} type="button" className={`os-chip${draft.template === key ? ' active' : ''}`} onClick={() => setDraft(current => ({ ...current, template: key }))}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="os-inline-actions">
                <Button onClick={() => void createProject()}>Create</Button>
                <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
              </div>
            </div>
          </Card>
        ) : null}

        <GlobalSearch />
        <SearchBar value={search} onChange={event => setSearch(event.target.value)} placeholder="Search anything..." />
        <div className="os-segmented-control" role="group" aria-label="Project view">
          <button type="button" className={viewMode === 'grid' ? 'active' : ''} onClick={() => setViewMode('grid')}>Grid</button>
          <button type="button" className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')}>List</button>
        </div>
        <FilterChips items={TABS} active={tab} onChange={setTab} />

        {loading ? <LoadingState label="Loading projects" /> : !payload ? (
          authState === 'expired'
            ? <EmptyState title="Session expired" body="Sign in again to inspect workspace projects." action={<Button href="/signin">Sign in again</Button>} />
            : <EmptyState title="Sign in required" body="Sign in to inspect workspace projects." action={<Button href="/signin">Sign in</Button>} />
        ) : items.length === 0 ? (
          <EmptyState title="No projects found" body="Create or pin a project to populate this list." action={<Button href="/studio?mode=nl&prompt=Create%20a%20project">Create Project</Button>} />
        ) : viewMode === 'grid' ? (
          <div className="library-card-grid">
            {items.map(item => (
              <Link key={item.id} href={item.href} style={{ textDecoration: 'none' }}>
                <Card style={{ minHeight: 190, padding: 18 }}>
                  <div className="os-entity-head">
                    <div>
                      <div className="os-entity-title">{item.name}</div>
                      <div className="os-entity-copy">{item.description}</div>
                    </div>
                    <Badge tone={item.status === 'active' ? 'success' : 'warning'}>{item.status}</Badge>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 18 }}>
                    <div><div className="os-entity-meta">Assets</div><strong>{item.runs + item.users}</strong></div>
                    <div><div className="os-entity-meta">Members</div><strong>{Math.max(1, item.users)}</strong></div>
                    <div><div className="os-entity-meta">Last Activity</div><strong>{new Date(item.updatedAt).toLocaleDateString()}</strong></div>
                  </div>
                  <div className="os-inline-actions" style={{ marginTop: 18 }}>
                    <button type="button" className="btn-ghost" onClick={event => { event.preventDefault(); void togglePin(item); }}>{item.pinned ? 'Unpin' : 'Pin'}</button>
                    <span className="btn-ghost">Open</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <DataTable
            columns={['Project', 'Assets', 'Members', 'Last Activity', 'Status', '']}
            rows={items.map(item => [
              <div key={`${item.id}-project`}>
                <div className="os-entity-title">{item.name}</div>
                <div className="os-entity-copy">{item.description}</div>
              </div>,
              String(item.runs + item.users),
              String(Math.max(1, item.users)),
              new Date(item.updatedAt).toLocaleDateString(),
              item.status,
              <div key={`${item.id}-actions`} className="os-inline-actions">
                <button type="button" className="btn-ghost" onClick={() => void togglePin(item)}>{item.pinned ? 'Unpin' : 'Pin'}</button>
                <Link href={item.href} className="btn-ghost">Open</Link>
              </div>,
            ])}
          />
        )}
      </WorkspaceShell>
    </div>
  );
}
