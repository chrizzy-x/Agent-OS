'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import { useApplicationShell } from '@/components/os/application-shell';
import { fetchBrowserSessionState, fetchWithBrowserSession, type BrowserSessionAuthState } from '@/src/auth/browser-session';
import { Badge, Button, Card, DataTable, EmptyState, FilterChips, LoadingState, PageHeader, SearchBar } from '@/components/os/ui';

type LibraryKind =
  | 'installed_app'
  | 'installed_skill'
  | 'saved_workflow'
  | 'subagent'
  | 'memory_collection'
  | 'template'
  | 'file'
  | 'published_asset'
  | 'forked_asset'
  | 'mcp_connection'
  | 'external_connection'
  | 'download'
  | 'recent_activity';

type LibraryItem = {
  id: string;
  kind: LibraryKind;
  name: string;
  description: string;
  href: string;
  workspaceId: string | null;
  projectId: string | null;
  visibility: 'private' | 'workspace' | 'public';
  updatedAt: string | null;
  metadata?: Record<string, unknown>;
};

type LibraryPayload = {
  items: LibraryItem[];
  groups: Record<LibraryKind, LibraryItem[]>;
  summary: Record<LibraryKind, number>;
};

const FILTERS = [
  { key: 'all', label: 'All', kinds: [] as LibraryKind[] },
  { key: 'apps', label: 'Apps', kinds: ['installed_app'] as LibraryKind[] },
  { key: 'skills', label: 'Skills', kinds: ['installed_skill'] as LibraryKind[] },
  { key: 'agents', label: 'Agents', kinds: ['subagent'] as LibraryKind[] },
  { key: 'workflows', label: 'Workflows', kinds: ['saved_workflow'] as LibraryKind[] },
  { key: 'connectors', label: 'Connectors', kinds: ['mcp_connection', 'external_connection'] as LibraryKind[] },
  { key: 'memory', label: 'Memory', kinds: ['memory_collection'] as LibraryKind[] },
  { key: 'files', label: 'Files', kinds: ['file', 'download'] as LibraryKind[] },
];

function formatKind(value: string): string {
  return value.replace(/_/g, ' ');
}

function formatDate(value: string | null): string {
  if (!value) return 'Recent';
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return 'Recent';
  }
}

export default function LibraryPage() {
  const shell = useApplicationShell();
  const [payload, setPayload] = useState<LibraryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [authState, setAuthState] = useState<BrowserSessionAuthState>('signed_out');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sessionState = await fetchBrowserSessionState().catch(() => ({ state: 'signed_out' as const, session: null }));
      setAuthState(sessionState.state);
      if (!sessionState.session) {
        setPayload(null);
        return;
      }
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (shell.activeWorkspaceId) params.set('workspaceId', shell.activeWorkspaceId);
      const { response, authState: nextAuthState } = await fetchWithBrowserSession(`/api/library?${params.toString()}`, { cache: 'no-store' });
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

  useEffect(() => {
    function syncFilterFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const requested = params.get('view') ?? params.get('filter');
      if (requested && FILTERS.some(item => item.key === requested)) setFilter(requested);
    }
    syncFilterFromUrl();
    window.addEventListener('popstate', syncFilterFromUrl);
    return () => window.removeEventListener('popstate', syncFilterFromUrl);
  }, []);

  const items = useMemo(() => {
    const base = payload?.items ?? [];
    const current = FILTERS.find(item => item.key === filter) ?? FILTERS[0];
    return current.key === 'all' ? base : base.filter(item => current.kinds.includes(item.kind));
  }, [filter, payload?.items]);

  async function installToDevice(item: LibraryItem) {
    const targets = Array.isArray(item.metadata?.supportedDeviceTargets)
      ? item.metadata.supportedDeviceTargets.filter((target): target is string => typeof target === 'string')
      : [];
    const target = targets[0] ?? 'pwa';
    const slug = typeof item.metadata?.slug === 'string' ? item.metadata.slug : '';
    if (!slug) return;
    setMessage('');
    const response = await fetch(`/api/apps/${encodeURIComponent(slug)}/device-install`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, workspaceId: item.workspaceId }),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string; target?: string };
    setMessage(response.ok ? `Device install started for ${item.name} (${payload.target ?? target}).` : payload.error ?? 'Device install failed.');
    await load();
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/library" />
      <WorkspaceShell
        activePath="/library"
        aside={(
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 12 }}>Library</div>
            <div className="os-drawer-stack">
              {FILTERS.slice(1).map(item => (
                <div key={item.key} className="os-entity-head">
                  <span className="os-entity-copy">{item.label}</span>
                  <Badge tone="default">{item.kinds.reduce((sum, kind) => sum + (payload?.summary?.[kind] ?? 0), 0)}</Badge>
                </div>
              ))}
            </div>
          </Card>
        )}
      >
        <PageHeader
          eyebrow="Library"
          title="Library"
          subtitle="Owned apps, skills, agents, workflows, connectors, memory, and files."
          actions={<Button href="/studio" variant="secondary">Use in Super AgentOS</Button>}
        />
        <SearchBar value={search} onChange={event => setSearch(event.target.value)} placeholder="Search library assets" />
        <div className="library-toolbar">
          <FilterChips items={FILTERS.map(item => item.label)} active={FILTERS.find(item => item.key === filter)?.label ?? 'All'} onChange={label => setFilter(FILTERS.find(item => item.label === label)?.key ?? 'all')} />
          <div className="os-segmented-control" role="group" aria-label="Library view">
            <button type="button" className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')}>Grid</button>
            <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>List</button>
          </div>
        </div>
        {message ? <Card><div className="os-entity-copy">{message}</div></Card> : null}

        {loading ? <LoadingState label="Loading library" /> : !payload ? (
          authState === 'expired'
            ? <EmptyState title="Session expired" body="Sign in again to view installed and saved assets." action={<Button href="/signin">Sign in again</Button>} />
            : <EmptyState title="Sign in required" body="Sign in to view installed and saved assets." action={<Button href="/signin">Sign in</Button>} />
        ) : items.length === 0 ? (
          <EmptyState title="No assets found" body="Install apps or skills, save workflows, or add files to populate Library." action={<Button href="/appstore">Open App Store</Button>} />
        ) : view === 'grid' ? (
          <div className="library-grid">
            {items.map(item => (
              <Card key={item.id} className="library-grid-card">
                <div className="os-drawer-stack">
                  <div className="os-entity-head">
                    <div>
                      <div className="os-entity-title">{item.name}</div>
                      <div className="os-entity-copy">{item.description}</div>
                    </div>
                    <Badge tone={item.visibility === 'public' ? 'success' : item.visibility === 'workspace' ? 'accent' : 'default'}>{item.visibility}</Badge>
                  </div>
                  <div className="os-entity-meta">
                    <span>{formatKind(item.kind)}</span>
                    <span>{formatDate(item.updatedAt)}</span>
                  </div>
                  <div className="os-inline-actions">
                    <Link href={item.href} className="btn-ghost">{item.kind === 'installed_skill' ? 'Configure' : 'Open'}</Link>
                    {item.kind === 'installed_app' ? <Link href={item.href} className="btn-ghost">Manage</Link> : null}
                    {item.kind === 'installed_app' && Array.isArray(item.metadata?.supportedDeviceTargets) && item.metadata.supportedDeviceTargets.length > 0 ? (
                      <button type="button" className="btn-ghost" onClick={() => void installToDevice(item)}>Update</button>
                    ) : null}
                    {item.kind === 'installed_skill' ? <Link href={item.href} className="btn-ghost">Enable</Link> : null}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <DataTable
            columns={['Asset', 'Type', 'Visibility', 'Updated', '']}
            rows={items.map(item => [
              <div key={`${item.id}-asset`}>
                <div className="os-entity-title">{item.name}</div>
                <div className="os-entity-copy">{item.description}</div>
              </div>,
              formatKind(item.kind),
              <Badge key={`${item.id}-visibility`} tone={item.visibility === 'public' ? 'success' : item.visibility === 'workspace' ? 'accent' : 'default'}>{item.visibility}</Badge>,
              formatDate(item.updatedAt),
              <div key={`${item.id}-actions`} className="os-inline-actions">
                <Link href={item.href} className="btn-ghost">Open</Link>
                {item.kind === 'installed_app' && Array.isArray(item.metadata?.supportedDeviceTargets) && item.metadata.supportedDeviceTargets.length > 0 ? (
                  <button type="button" className="btn-ghost" onClick={() => void installToDevice(item)}>Install device</button>
                ) : null}
              </div>,
            ])}
          />
        )}
      </WorkspaceShell>
    </div>
  );
}
