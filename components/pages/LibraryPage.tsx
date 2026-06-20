'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import GlobalSearch from '@/components/os/global-search';
import { useApplicationShell } from '@/components/os/application-shell';
import { fetchBrowserSessionState, fetchWithBrowserSession, type BrowserSessionAuthState } from '@/src/auth/browser-session';
import { Badge, Button, Card, DataTable, EmptyState, LoadingState, PageHeader, SearchBar } from '@/components/os/ui';

type LibraryKind =
  | 'installed_app'
  | 'installed_skill'
  | 'saved_workflow'
  | 'subagent'
  | 'template'
  | 'file'
  | 'published_asset'
  | 'forked_asset'
  | 'memory'
  | 'vault_secret'
  | 'connector'
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
  groups: Partial<Record<LibraryKind, LibraryItem[]>>;
  summary: Partial<Record<LibraryKind, number>>;
};

const SECTIONS = [
  { group: 'Assets', key: 'apps', label: 'Apps', kinds: ['installed_app'] as LibraryKind[] },
  { group: 'Assets', key: 'skills', label: 'Skills', kinds: ['installed_skill'] as LibraryKind[] },
  { group: 'Assets', key: 'subagents', label: 'Subagents', kinds: ['subagent'] as LibraryKind[] },
  { group: 'Infrastructure', key: 'memory', label: 'Memory', kinds: ['memory'] as LibraryKind[] },
  { group: 'Infrastructure', key: 'vault', label: 'Vault', kinds: ['vault_secret'] as LibraryKind[] },
  { group: 'Infrastructure', key: 'connectors', label: 'Connectors', kinds: ['connector', 'mcp_connection', 'external_connection'] as LibraryKind[] },
  { group: 'Other', key: 'downloads', label: 'Downloads', kinds: ['download'] as LibraryKind[] },
  { group: 'Other', key: 'published', label: 'Published', kinds: ['published_asset', 'forked_asset'] as LibraryKind[] },
] as const;

function formatDate(value: string | null) {
  if (!value) return 'Recent';
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return 'Recent';
  }
}

function countSection(payload: LibraryPayload | null, kinds: readonly LibraryKind[]) {
  return kinds.reduce((sum, kind) => sum + (payload?.summary?.[kind] ?? 0), 0);
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || 'A';
}

function SectionNav(props: { payload: LibraryPayload | null; active: string; onChange: (key: string) => void }) {
  return (
    <div className="library-section-nav">
      {['Assets', 'Infrastructure', 'Other'].map(group => (
        <section key={group}>
          <h3>{group}</h3>
          <div>
            {SECTIONS.filter(item => item.group === group).map(item => (
              <button key={item.key} type="button" className={props.active === item.key ? 'active' : ''} onClick={() => props.onChange(item.key)}>
                <span>{item.label}</span>
                <Badge>{countSection(props.payload, item.kinds)}</Badge>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function AppLibraryCard(props: { item: LibraryItem; onInstallDevice: (item: LibraryItem) => void }) {
  return (
    <Card className="library-app-card">
      <div className="library-app-logo" aria-hidden="true">{initials(props.item.name)}</div>
      <div>
        <div className="os-entity-title">{props.item.name}</div>
        <div className="os-entity-copy">{props.item.description}</div>
      </div>
      <div className="os-inline-actions">
        <Badge tone={props.item.metadata?.status === 'active' ? 'success' : 'default'}>{String(props.item.metadata?.status ?? 'installed')}</Badge>
        <Badge>v{String(props.item.metadata?.installedVersion ?? '1.0.0')}</Badge>
        <Badge>{formatDate(props.item.updatedAt)}</Badge>
      </div>
      <div className="os-inline-actions">
        <Link href={props.item.href} className="btn-ghost">Open</Link>
        <button type="button" className="btn-ghost" onClick={() => props.onInstallDevice(props.item)}>Install To Device</button>
        <button type="button" className="btn-ghost">Remove</button>
      </div>
    </Card>
  );
}

export default function LibraryPage() {
  const shell = useApplicationShell();
  const searchParams = useSearchParams();
  const initialSection = searchParams.get('section') ?? 'apps';
  const [payload, setPayload] = useState<LibraryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [authState, setAuthState] = useState<BrowserSessionAuthState>('signed_out');
  const [search, setSearch] = useState('');
  const [section, setSection] = useState(SECTIONS.some(item => item.key === initialSection) ? initialSection : 'apps');
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
    if (SECTIONS.some(item => item.key === initialSection)) setSection(initialSection);
  }, [initialSection]);

  const activeSection = SECTIONS.find(item => item.key === section) ?? SECTIONS[0];
  const items = useMemo(
    () => (payload?.items ?? []).filter(item => activeSection.kinds.includes(item.kind)),
    [activeSection.kinds, payload?.items],
  );

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
    const body = await response.json().catch(() => ({})) as { error?: string; target?: string };
    setMessage(response.ok ? `Device install started for ${item.name} (${body.target ?? target}).` : body.error ?? 'Device install failed.');
    await load();
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/library" />
      <WorkspaceShell
        activePath="/library"
        aside={<SectionNav payload={payload} active={section} onChange={setSection} />}
      >
        <PageHeader
          eyebrow="Library"
          title="Library"
          subtitle="Workspace ownership for assets, infrastructure, downloads, and published work."
          actions={<Button href="/appstore">Discover Apps</Button>}
        />
        <GlobalSearch />
        <div className="library-mobile-tabs">
          <div>
            {SECTIONS.slice(0, 3).map(item => <button key={item.key} type="button" className={section === item.key ? 'active' : ''} onClick={() => setSection(item.key)}>{item.label}</button>)}
          </div>
          <div>
            {SECTIONS.slice(3, 6).map(item => <button key={item.key} type="button" className={section === item.key ? 'active' : ''} onClick={() => setSection(item.key)}>{item.label}</button>)}
          </div>
        </div>
        <SearchBar value={search} onChange={event => setSearch(event.target.value)} placeholder="Search anything..." />
        {message ? <Card><div className="os-entity-copy">{message}</div></Card> : null}

        {loading ? <LoadingState label="Loading Library" /> : !payload ? (
          authState === 'expired'
            ? <EmptyState title="Session expired" body="Sign in again to view Library ownership." action={<Button href="/signin">Sign in again</Button>} />
            : <EmptyState title="Sign in required" body="Sign in to view Library ownership." action={<Button href="/signin">Sign in</Button>} />
        ) : items.length === 0 ? (
          <EmptyState title={`No ${activeSection.label}`} body="This workspace section has no owned items yet." action={<Button href="/appstore">Open App Store</Button>} />
        ) : section === 'apps' ? (
          <div className="library-card-grid">
            {items.map(item => <AppLibraryCard key={item.id} item={item} onInstallDevice={installToDevice} />)}
          </div>
        ) : section === 'subagents' ? (
          <div className="library-card-grid">
            {items.map(item => (
              <Card key={item.id} className="library-roster-card">
                <div className="library-avatar">{initials(item.name)}</div>
                <div>
                  <div className="os-entity-title">{item.name}</div>
                  <div className="os-entity-copy">{item.description}</div>
                  <div className="os-inline-actions" style={{ marginTop: 10 }}>
                    <Badge>{String(item.metadata?.status ?? 'active')}</Badge>
                    <Badge>{String(item.metadata?.memoryScope ?? 'workspace')}</Badge>
                  </div>
                </div>
                <div className="os-inline-actions">
                  <Link href={item.href} className="btn-ghost">Open</Link>
                  <Link href={item.href} className="btn-ghost">Edit</Link>
                  <button type="button" className="btn-ghost">Disable</button>
                </div>
              </Card>
            ))}
          </div>
        ) : section === 'memory' || section === 'vault' ? (
          <DataTable
            columns={section === 'vault' ? ['Secret Name', 'Provider', 'Assigned Assets', 'Last Used', 'Status', 'Actions'] : ['Memory', 'Scope', 'Created', 'Last Used', 'Status', 'Actions']}
            rows={items.map(item => section === 'vault'
              ? [
                item.name,
                String(item.metadata?.provider ?? 'Vault'),
                String(item.metadata?.assignedAssets ?? 0),
                formatDate(typeof item.metadata?.lastUsedAt === 'string' ? item.metadata.lastUsedAt : item.updatedAt),
                <Badge key={`${item.id}-status`}>{String(item.metadata?.status ?? 'active')}</Badge>,
                <div key={`${item.id}-actions`} className="os-inline-actions"><button type="button" className="btn-ghost">Edit</button><button type="button" className="btn-ghost">Disable</button><button type="button" className="btn-danger">Delete</button></div>,
              ]
              : [
                item.name,
                String(item.metadata?.scope ?? 'workspace'),
                formatDate(item.updatedAt),
                formatDate(item.updatedAt),
                <Badge key={`${item.id}-status`}>{String(item.metadata?.status ?? 'active')}</Badge>,
                <div key={`${item.id}-actions`} className="os-inline-actions"><button type="button" className="btn-ghost">Edit</button><button type="button" className="btn-ghost">Disable</button><button type="button" className="btn-danger">Delete</button></div>,
              ])}
          />
        ) : section === 'connectors' ? (
          <div className="library-card-grid">
            {items.map(item => (
              <Card key={item.id}>
                <div className="os-entity-head">
                  <div>
                    <div className="os-entity-title">{item.name}</div>
                    <div className="os-entity-copy">{item.description}</div>
                  </div>
                  <Badge tone={item.metadata?.status === 'active' ? 'success' : 'default'}>{String(item.metadata?.status ?? 'active')}</Badge>
                </div>
                <div className="os-inline-actions" style={{ marginTop: 12 }}>
                  <Badge>{String(item.metadata?.provider ?? 'Connector')}</Badge>
                  <Badge>{String(item.metadata?.permissions ?? 0)} permissions</Badge>
                </div>
                <div className="os-inline-actions" style={{ marginTop: 12 }}>
                  <button type="button" className="btn-ghost">Configure</button>
                  <button type="button" className="btn-ghost">Reconnect</button>
                  <button type="button" className="btn-ghost">Disable</button>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="library-card-grid">
            {items.map(item => (
              <Card key={item.id}>
                <div className="os-entity-head">
                  <div>
                    <div className="os-entity-title">{item.name}</div>
                    <div className="os-entity-copy">{item.description}</div>
                  </div>
                  <Badge>{activeSection.label}</Badge>
                </div>
                <div className="os-inline-actions" style={{ marginTop: 12 }}>
                  <Link href={item.href} className="btn-ghost">Open</Link>
                  <button type="button" className="btn-ghost">Configure</button>
                  <button type="button" className="btn-ghost">Disable</button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </WorkspaceShell>
    </div>
  );
}
