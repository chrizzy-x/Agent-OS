'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import { useApplicationShell } from '@/components/os/application-shell';
import { fetchBrowserSessionState, fetchWithBrowserSession, type BrowserSessionAuthState } from '@/src/auth/browser-session';
import {
  ActivityFeed,
  Badge,
  Button,
  Card,
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

export default function ProjectsPage() {
  const router = useRouter();
  const shell = useApplicationShell();
  const [payload, setPayload] = useState<ProjectsPayload | null>(null);
  const [authState, setAuthState] = useState<BrowserSessionAuthState>('signed_out');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('Recent');
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

  function metadataCount(item: ProjectItem, key: string): string {
    const value = item.metadata?.[key];
    return typeof value === 'number' ? value.toLocaleString() : 'Not recorded';
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
          title="Mission Control"
          subtitle="Project status, assets, recent activity, assigned agents, workflows, and files."
          actions={<Button onClick={() => setCreating(value => !value)}>Create Project</Button>}
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

        <SearchBar value={search} onChange={event => setSearch(event.target.value)} placeholder="Search projects" />
        <FilterChips items={TABS} active={tab} onChange={setTab} />

        {loading ? <LoadingState label="Loading projects" /> : !payload ? (
          authState === 'expired'
            ? <EmptyState title="Session expired" body="Sign in again to inspect workspace projects." action={<Button href="/signin">Sign in again</Button>} />
            : <EmptyState title="Sign in required" body="Sign in to inspect workspace projects." action={<Button href="/signin">Sign in</Button>} />
        ) : items.length === 0 ? (
          <EmptyState title="No projects found" body="Create or pin a project to populate this list." action={<Button href="/studio?mode=nl&prompt=Create%20a%20project">Create Project</Button>} />
        ) : (
          <div className="project-mission-grid">
            {items.map(item => (
              <Card key={item.id} className="project-mission-card">
                <div className="os-entity-head">
                  <div>
                    <div className="os-entity-title">{item.name}</div>
                    <div className="os-entity-copy">{item.description}</div>
                  </div>
                  <div className="os-entity-badges">
                    <Badge>{item.kind}</Badge>
                    <Badge tone={item.status === 'active' ? 'success' : 'warning'}>{item.status}</Badge>
                  </div>
                </div>
                <dl className="project-mission-facts">
                  <div><dt>Status</dt><dd>{item.status}</dd></div>
                  <div><dt>Assets</dt><dd>{metadataCount(item, 'assetCount')}</dd></div>
                  <div><dt>Recent Activity</dt><dd>{new Date(item.updatedAt).toLocaleDateString()}</dd></div>
                  <div><dt>Assigned Agents</dt><dd>{metadataCount(item, 'assignedAgentsCount')}</dd></div>
                  <div><dt>Workflows</dt><dd>{item.runs.toLocaleString()}</dd></div>
                  <div><dt>Files</dt><dd>{metadataCount(item, 'fileCount')}</dd></div>
                </dl>
                <div className="os-inline-actions">
                  <button type="button" className="btn-ghost" onClick={() => void togglePin(item)}>{item.pinned ? 'Unpin' : 'Pin'}</button>
                  <Link href={item.href} className="btn-ghost">Open</Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </WorkspaceShell>
    </div>
  );
}
