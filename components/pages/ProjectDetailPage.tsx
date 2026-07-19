'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import { useApplicationShell } from '@/components/os/application-shell';
import { fetchBrowserSessionState, fetchWithBrowserSession, type BrowserSessionAuthState } from '@/src/auth/browser-session';
import { Badge, Button, Card, ConfirmationDialog, DataTable, EmptyState, Input, LoadingState, PageHeader, Tabs, Textarea } from '@/components/os/ui';

type Project = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  workspaceId: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
};

type ProjectPayload = {
  project: Project;
  tabs: Record<string, Array<Record<string, unknown>> | Record<string, unknown>>;
  summary: Record<string, number>;
};

type ProjectTab = 'overview' | 'assets' | 'activity' | 'files' | 'settings';

const TAB_KEYS: ProjectTab[] = ['overview', 'assets', 'activity', 'files', 'settings'];

function title(value: string): string {
  return value.replace(/^\w/, char => char.toUpperCase());
}

function labelFor(item: Record<string, unknown>): string {
  return String(item.name ?? item.title ?? item.path ?? item.key ?? item.id ?? 'Item');
}

function descriptionFor(item: Record<string, unknown>): string {
  return String(item.description ?? item.summary ?? item.status ?? item.category ?? item.visibility ?? '');
}

function entityFor(item: Record<string, unknown>): Record<string, unknown> {
  if (item.app && typeof item.app === 'object' && !Array.isArray(item.app)) return item.app as Record<string, unknown>;
  if (item.skill && typeof item.skill === 'object' && !Array.isArray(item.skill)) return item.skill as Record<string, unknown>;
  return item;
}

function hrefFor(tab: string, item: Record<string, unknown>): string {
  const sourceTab = String(item.__tab ?? tab);
  if (sourceTab === 'apps') {
    const app = entityFor(item);
    return app.slug ? `/appstore/${String(app.slug)}` : '/library?view=apps';
  }
  if (sourceTab === 'skills') {
    const skill = entityFor(item);
    return `/skills/${String(skill.slug ?? skill.id ?? '')}`;
  }
  if (sourceTab === 'workflows') return `/workflows/${String(item.id)}`;
  if (sourceTab === 'subagents') return `/subagents/${String(item.id)}`;
  if (sourceTab === 'memory') return '/memory';
  if (sourceTab === 'secrets') return '/vault';
  if (sourceTab === 'mcp') return '/mcp';
  if (tab === 'chats') return `/studio?session=${encodeURIComponent(String(item.id))}`;
  if (tab === 'files') return `/files`;
  if (sourceTab === 'chats') return `/studio?session=${encodeURIComponent(String(item.id))}`;
  if (sourceTab === 'logs') return '/search';
  return '/projects';
}

export default function ProjectDetailPage({ projectId }: { projectId: string }) {
  const router = useRouter();
  const shell = useApplicationShell();
  const [payload, setPayload] = useState<ProjectPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [authState, setAuthState] = useState<BrowserSessionAuthState>('signed_out');
  const [tab, setTab] = useState<ProjectTab>('overview');
  const [editing, setEditing] = useState(false);
  const [working, setWorking] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState({ name: '', description: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sessionState = await fetchBrowserSessionState().catch(() => ({ state: 'signed_out' as const, session: null }));
      setAuthState(sessionState.state);
      if (!sessionState.session) {
        setPayload(null);
        return;
      }
      const { response, authState: nextAuthState } = await fetchWithBrowserSession(`/api/projects/${encodeURIComponent(projectId)}`, { cache: 'no-store' });
      setAuthState(nextAuthState);
      const data = await response.json();
      const nextPayload = response.ok ? data as ProjectPayload : null;
      setPayload(nextPayload);
      if (nextPayload) {
        setDraft({
          name: nextPayload.project.name,
          description: nextPayload.project.description ?? '',
        });
        shell.syncContext({ workspaceId: nextPayload.project.workspaceId, projectId: nextPayload.project.id });
      }
    } catch {
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [projectId, shell]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo<Array<Record<string, unknown>>>(() => {
    if (!payload) return [];
    if (tab === 'assets') {
      return ['apps', 'skills', 'workflows', 'subagents', 'memory', 'secrets', 'mcp'].flatMap(key => {
        const value = payload.tabs[key];
        return Array.isArray(value) ? value.map(item => ({ ...(item as Record<string, unknown>), __tab: key })) : [];
      });
    }
    if (tab === 'activity') {
      return ['chats', 'workflows'].flatMap(key => {
        const value = payload.tabs[key];
        return Array.isArray(value) ? value.map(item => ({ ...(item as Record<string, unknown>), __tab: key })) : [];
      });
    }
    const value = payload.tabs[tab];
    return Array.isArray(value) ? value : [];
  }, [payload, tab]);

  async function updateProject(patch: Record<string, unknown>, success: string) {
    if (!payload) return;
    setWorking(true);
    setMessage('');
    try {
      const result = await fetchWithBrowserSession(`/api/projects/${encodeURIComponent(payload.project.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const body = await result.response.json().catch(() => ({})) as { project?: Project; error?: string; message?: string };
      if (!result.response.ok || !body.project) {
        setMessage(body.error ?? body.message ?? 'Project update failed.');
        return;
      }
      setPayload(current => current ? { ...current, project: body.project as Project } : current);
      setDraft({ name: body.project.name, description: body.project.description ?? '' });
      setEditing(false);
      setMessage(success);
      await shell.refreshShell();
    } finally {
      setWorking(false);
    }
  }

  async function deleteProject() {
    if (!payload) return;
    setWorking(true);
    setMessage('');
    try {
      const result = await fetchWithBrowserSession(`/api/projects/${encodeURIComponent(payload.project.id)}`, { method: 'DELETE' });
      const body = await result.response.json().catch(() => ({})) as { error?: string; message?: string };
      if (!result.response.ok) {
        setMessage(body.error ?? body.message ?? 'Project delete failed.');
        return;
      }
      await shell.refreshShell();
      router.push('/projects');
    } finally {
      setWorking(false);
      setDeleteOpen(false);
    }
  }

  const isDefaultProject = payload?.project.metadata?.system === true || payload?.project.id.includes('_default') || payload?.project.name === 'Default Project';

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/projects" />
      <WorkspaceShell activePath="/projects">
        {loading ? <LoadingState label="Loading project" /> : !payload ? (
          authState === 'expired'
            ? <EmptyState title="Session expired" body="Sign in again to inspect this project." action={<Button href="/signin">Sign in again</Button>} />
            : authState === 'signed_out'
              ? <EmptyState title="Sign in required" body="Sign in to inspect this project." action={<Button href="/signin">Sign in</Button>} />
              : <EmptyState title="Project unavailable" body="This project could not be loaded." action={<Button href="/projects">Projects</Button>} />
        ) : (
          <>
            <PageHeader
              eyebrow="Project"
              title={payload.project.name}
              subtitle={payload.project.description ?? 'Project overview, assets, activity, files, and settings.'}
              actions={(
                <>
                  <Button href={`/studio?mode=nl&project=${encodeURIComponent(payload.project.id)}&workspace=${encodeURIComponent(payload.project.workspaceId)}`} variant="secondary">Open in Studio</Button>
                  <Button href={`/search?project=${encodeURIComponent(payload.project.id)}`} variant="secondary">Search Project</Button>
                  <Button href="/library" variant="secondary">Library</Button>
                </>
              )}
            />
            {message ? <Card><div className="os-entity-copy">{message}</div></Card> : null}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
              {['assets', 'activity', 'files'].map(key => (
                <Card key={key} style={{ padding: 12 }}>
                  <div className="os-entity-meta">{title(key)}</div>
                  <div className="os-metric-value">{
                    key === 'assets'
                      ? ['apps', 'skills', 'workflows', 'subagents', 'memory', 'secrets', 'mcp'].reduce((sum, name) => sum + (payload.summary[name] ?? 0), 0)
                      : key === 'activity'
                        ? (payload.summary.chats ?? 0) + (payload.summary.workflows ?? 0)
                        : payload.summary.files ?? 0
                  }</div>
                </Card>
              ))}
            </div>
            <Tabs tabs={TAB_KEYS.map(key => ({ key, label: title(key) }))} active={tab} onChange={key => setTab(key as ProjectTab)} />
            {tab === 'overview' ? (
              <div className="project-detail-grid">
                <Card>
                  <div className="os-entity-head">
                    <div>
                      <div className="os-entity-title">{payload.project.name}</div>
                      <div className="os-entity-copy">{String((payload.tabs.overview as Record<string, unknown>)?.summary ?? 'No activity summary yet.')}</div>
                    </div>
                    <Badge tone={payload.project.status === 'active' ? 'success' : 'warning'}>{payload.project.status}</Badge>
                  </div>
                </Card>
                <Card>
                  <div className="os-entity-title">Attached context</div>
                  <div className="project-context-grid">
                    <span>Sessions <b>{payload.summary.chats ?? 0}</b></span>
                    <span>Apps <b>{payload.summary.apps ?? 0}</b></span>
                    <span>Skills <b>{payload.summary.skills ?? 0}</b></span>
                    <span>Workflows <b>{payload.summary.workflows ?? 0}</b></span>
                    <span>Incognito operators <b>{payload.summary.subagents ?? 0}</b></span>
                    <span>Files <b>{payload.summary.files ?? 0}</b></span>
                  </div>
                  <div className="os-inline-actions" style={{ marginTop: 12 }}>
                    <Button href={`/studio?mode=nl&project=${encodeURIComponent(payload.project.id)}&workspace=${encodeURIComponent(payload.project.workspaceId)}`} variant="ghost">Start project chat</Button>
                    <Button href="/library" variant="ghost">Attach from Library</Button>
                    <Button disabled disabledReason="Direct project asset assignment needs a dedicated assignment API. Use the asset's connected surface for now.">Assign asset</Button>
                  </div>
                </Card>
              </div>
            ) : tab === 'settings' ? (
              <Card>
                {editing ? (
                  <div className="os-drawer-stack">
                    <label className="os-field-label" htmlFor="project-name">Project name</label>
                    <Input id="project-name" value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} placeholder="Project name" />
                    <label className="os-field-label" htmlFor="project-description">Description</label>
                    <Textarea id="project-description" value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} placeholder="Description" rows={4} />
                    <div className="os-inline-actions">
                      <Button onClick={() => void updateProject({ name: draft.name, description: draft.description }, 'Project details updated.')} loading={working} disabled={!draft.name.trim()}>Save changes</Button>
                      <Button variant="secondary" onClick={() => setEditing(false)} disabled={working}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="os-drawer-stack">
                    <div className="os-entity-copy">Project ID: {payload.project.id}</div>
                    <div className="os-entity-copy">Workspace ID: {payload.project.workspaceId}</div>
                    <div className="os-entity-copy">Status: {payload.project.status}</div>
                    <div className="os-entity-copy">Updated: {new Date(payload.project.updatedAt).toLocaleString()}</div>
                    <div className="os-inline-actions">
                      <Button variant="secondary" onClick={() => setEditing(true)}>Edit details</Button>
                      <Button variant="secondary" onClick={() => void updateProject({ status: payload.project.status === 'archived' ? 'active' : 'archived' }, payload.project.status === 'archived' ? 'Project restored.' : 'Project archived.')} loading={working}>
                        {payload.project.status === 'archived' ? 'Restore' : 'Archive'}
                      </Button>
                      <Button variant="destructive" onClick={() => setDeleteOpen(true)} disabled={isDefaultProject} disabledReason={isDefaultProject ? 'Default workspace projects cannot be deleted.' : undefined}>Delete</Button>
                    </div>
                  </div>
                )}
              </Card>
            ) : rows.length === 0 ? (
              <EmptyState title={`No ${tab}`} body={`This project has no ${tab} yet.`} />
            ) : (
              <DataTable
                columns={['Name', 'Detail', '']}
                rows={rows.map(item => {
                  const entity = entityFor(item);
                  return [
                    labelFor(entity),
                    descriptionFor(entity),
                    <Link key={`${tab}-${String(item.id)}-open`} href={hrefFor(tab, item)} className="btn-ghost">Open</Link>,
                  ];
                })}
              />
            )}
          </>
        )}
      </WorkspaceShell>
      <ConfirmationDialog
        open={deleteOpen}
        title="Delete project"
        body={`Delete ${payload?.project.name ?? 'this project'}? Project deletion is permanent and only succeeds when the backend confirms it is safe.`}
        confirmLabel="Delete"
        busy={working}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void deleteProject()}
      />
    </div>
  );
}
