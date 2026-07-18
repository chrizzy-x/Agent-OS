'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import { useApplicationShell } from '@/components/os/application-shell';
import { fetchBrowserSessionState, fetchWithBrowserSession, type BrowserSessionAuthState } from '@/src/auth/browser-session';
import { Badge, Button, Card, ConfirmationDialog, DataTable, EmptyState, FilterChips, LoadingState, PageHeader, SearchBar, Select } from '@/components/os/ui';

type LibraryKind =
  | 'installed_app'
  | 'installed_skill'
  | 'saved_workflow'
  | 'project'
  | 'subagent'
  | 'memory_collection'
  | 'saved_output'
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

type LibrarySort = 'recent' | 'name' | 'type' | 'status';

const FILTERS = [
  { key: 'all', label: 'All', kinds: [] as LibraryKind[] },
  { key: 'apps', label: 'Apps', kinds: ['installed_app'] as LibraryKind[] },
  { key: 'skills', label: 'Skills', kinds: ['installed_skill'] as LibraryKind[] },
  { key: 'projects', label: 'Projects', kinds: ['project'] as LibraryKind[] },
  { key: 'agents', label: 'Subagents', kinds: ['subagent'] as LibraryKind[] },
  { key: 'workflows', label: 'Workflows', kinds: ['saved_workflow'] as LibraryKind[] },
  { key: 'outputs', label: 'Outputs', kinds: ['saved_output'] as LibraryKind[] },
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

function sortTimestamp(value: string | null): number {
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

function metadataText(item: LibraryItem, keys: string[]): string {
  for (const key of keys) {
    const value = item.metadata?.[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number') return String(value);
  }
  return '';
}

function metadataList(item: LibraryItem, keys: string[]): string[] {
  for (const key of keys) {
    const value = item.metadata?.[key];
    if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
  }
  return [];
}

export default function LibraryPage() {
  const shell = useApplicationShell();
  const [payload, setPayload] = useState<LibraryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [authState, setAuthState] = useState<BrowserSessionAuthState>('signed_out');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState<LibrarySort>('recent');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [message, setMessage] = useState('');
  const [workingAssetId, setWorkingAssetId] = useState('');
  const [removeItem, setRemoveItem] = useState<LibraryItem | null>(null);

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
    const filtered = current.key === 'all' ? base : base.filter(item => current.kinds.includes(item.kind));
    return [...filtered].sort((left, right) => {
      if (sort === 'name') return left.name.localeCompare(right.name);
      if (sort === 'type') return formatKind(left.kind).localeCompare(formatKind(right.kind)) || left.name.localeCompare(right.name);
      if (sort === 'status') return metadataText(left, ['status']).localeCompare(metadataText(right, ['status'])) || left.name.localeCompare(right.name);
      return sortTimestamp(right.updatedAt) - sortTimestamp(left.updatedAt) || left.name.localeCompare(right.name);
    });
  }, [filter, payload?.items, sort]);

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

  function firstCapability(item: LibraryItem): string {
    const capabilities = Array.isArray(item.metadata?.capabilities) ? item.metadata.capabilities : [];
    const first = capabilities.find((capability): capability is Record<string, unknown> => Boolean(capability) && typeof capability === 'object' && !Array.isArray(capability));
    return typeof first?.name === 'string' ? first.name : '';
  }

  async function runSkill(item: LibraryItem) {
    const slug = typeof item.metadata?.slug === 'string' ? item.metadata.slug : '';
    const capability = firstCapability(item);
    if (!slug || !capability) {
      setMessage('This installed skill has no executable capability published.');
      return;
    }
    setWorkingAssetId(item.id);
    setMessage('');
    try {
      const response = await fetch('/api/skills/use', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill_slug: slug, capability, params: {} }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; message?: string; execution_time_ms?: number };
      setMessage(response.ok ? `${item.name} ran successfully${typeof payload.execution_time_ms === 'number' ? ` in ${payload.execution_time_ms}ms` : ''}.` : payload.error ?? payload.message ?? 'Skill run failed.');
    } finally {
      setWorkingAssetId('');
    }
  }

  async function removeSkill(item: LibraryItem) {
    const skillId = typeof item.metadata?.skillId === 'string' ? item.metadata.skillId : '';
    if (!skillId) return;
    setWorkingAssetId(item.id);
    setMessage('');
    try {
      const response = await fetch('/api/skills/uninstall', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill_id: skillId }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; message?: string };
      setMessage(response.ok ? `${item.name} removed from Library, Studio, workflows, and subagent attachment choices.` : payload.error ?? payload.message ?? 'Remove skill failed.');
      if (response.ok) {
        setRemoveItem(null);
        await load();
      }
    } finally {
      setWorkingAssetId('');
    }
  }

  async function removeApp(item: LibraryItem) {
    const slug = typeof item.metadata?.slug === 'string' ? item.metadata.slug : '';
    if (!slug) return;
    setWorkingAssetId(item.id);
    setMessage('');
    try {
      const response = await fetch(`/api/apps/${encodeURIComponent(slug)}/installation`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; message?: string };
      setMessage(response.ok ? `${item.name} uninstalled from this workspace and removed from Library.` : payload.error ?? payload.message ?? 'App uninstall failed.');
      if (response.ok) {
        setRemoveItem(null);
        await load();
      }
    } finally {
      setWorkingAssetId('');
    }
  }

  function metadataLine(item: LibraryItem): string {
    const parts = [
      typeof item.metadata?.status === 'string' ? item.metadata.status : null,
      typeof item.metadata?.version === 'string' ? `v${item.metadata.version}` : null,
      typeof item.metadata?.category === 'string' ? item.metadata.category : null,
      typeof item.metadata?.packageRef === 'string' ? 'offline package cached' : null,
      typeof item.metadata?.namespaceType === 'string' ? `${item.metadata.namespaceType} memory` : null,
    ].filter(Boolean);
    return parts.length ? parts.join(' - ') : 'Workspace asset';
  }

function ownerLabel(item: LibraryItem): string {
    return metadataText(item, ['publisherName', 'developerName', 'authorName', 'developerHandle', 'ownerName', 'sourceType']) || 'Workspace';
  }

  function installedStatus(item: LibraryItem): string {
    if (item.kind === 'installed_app' || item.kind === 'installed_skill') return metadataText(item, ['status']) || 'installed';
    if (item.kind === 'download') return metadataText(item, ['status']) || 'cached';
    return metadataText(item, ['status']) || 'saved';
  }

  function permissionLabel(item: LibraryItem): string {
    const permissions = metadataList(item, ['permissionsRequired', 'permissionsApproved']);
    if (permissions.length === 0) return 'No special permissions';
    return `${permissions.length} permission${permissions.length === 1 ? '' : 's'}`;
  }

  function compatibilityLabel(item: LibraryItem): string {
    const compatibility = metadataList(item, ['compatibility', 'supportedDeviceTargets']);
    if (compatibility.length === 0) return item.kind === 'installed_app' ? 'AgentOS app' : 'Workspace';
    return compatibility.slice(0, 3).join(', ');
  }

  function lastUsedDate(item: LibraryItem): string {
    return formatDate(metadataText(item, ['lastOpenedAt', 'lastUsedAt', 'completedAt', 'installedAt']) || item.updatedAt);
  }

  function renderMetadata(item: LibraryItem) {
    return (
      <div className="library-card-meta" aria-label={`${item.name} metadata`}>
        <span><b>Last used</b>{lastUsedDate(item)}</span>
        <span><b>Owner</b>{ownerLabel(item)}</span>
        <span><b>Status</b>{installedStatus(item)}</span>
        <span><b>Permissions</b>{permissionLabel(item)}</span>
        <span><b>Compatibility</b>{compatibilityLabel(item)}</span>
      </div>
    );
  }

  function renderActions(item: LibraryItem) {
    const removable = item.kind === 'installed_skill' || item.kind === 'installed_app';
    const configureHref = item.kind === 'installed_app' || item.kind === 'installed_skill' ? item.href : undefined;
    const canRunSkill = item.kind === 'installed_skill' && Boolean(firstCapability(item));
    const workflowRunDisabled = item.kind === 'saved_workflow' ? 'Open workflow details to run, edit, retry, or inspect logs.' : undefined;
    return (
      <div className="os-inline-actions">
        <Button href={item.href} variant="ghost">Open</Button>
        {configureHref ? (
          <span data-action="configure">
            <Button href={configureHref} variant="ghost">Configure</Button>
          </span>
        ) : null}
        {item.kind === 'installed_skill' ? (
          <span data-action="run-skill">
            <Button variant="ghost" onClick={() => void runSkill(item)} disabled={workingAssetId === item.id || !canRunSkill} disabledReason={!canRunSkill ? 'This skill has no executable capability published.' : undefined}>
              {workingAssetId === item.id ? 'Running' : 'Run'}
            </Button>
          </span>
        ) : null}
        {item.kind === 'saved_workflow' ? <Button variant="ghost" disabled disabledReason={workflowRunDisabled}>Run</Button> : null}
        {item.kind === 'installed_app' && Array.isArray(item.metadata?.supportedDeviceTargets) && item.metadata.supportedDeviceTargets.length > 0 ? (
          <Button variant="ghost" onClick={() => void installToDevice(item)}>Install device</Button>
        ) : null}
        {item.kind === 'installed_skill' ? <Button href="/studio?mode=nl" variant="ghost">Use in Studio</Button> : null}
        {item.kind === 'saved_output' || item.kind === 'file' || item.kind === 'download' ? (
          <Button variant="ghost" disabled disabledReason="Export endpoints are not connected for this asset yet.">Export</Button>
        ) : null}
        <Button variant="ghost" disabled disabledReason="Pinning is not connected yet.">Pin</Button>
        <Button variant="ghost" disabled disabledReason="Duplicate/fork actions require a supported reusable asset backend.">Duplicate</Button>
        <Button variant="ghost" disabled disabledReason="Sharing requires explicit project or workspace permission controls.">Share</Button>
        <Button variant="ghost" disabled disabledReason="Project assignment is not connected for this asset type yet.">Assign</Button>
        {item.kind === 'installed_skill' ? (
          <span data-action="remove-skill">
            <Button variant="destructive" onClick={() => setRemoveItem(item)} disabled={workingAssetId === item.id}>Uninstall</Button>
          </span>
        ) : null}
        {item.kind === 'installed_app' ? (
          <span data-action="remove-app">
            <Button variant="destructive" onClick={() => setRemoveItem(item)} disabled={workingAssetId === item.id}>Uninstall</Button>
          </span>
        ) : null}
        {!removable && item.kind !== 'project' ? <Button variant="destructive" disabled disabledReason="Delete is only enabled where the backing asset API supports removal.">Delete</Button> : null}
      </div>
    );
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
          subtitle="Installed apps, installed skills, subagents, workflows, projects, memory, files, outputs, and downloaded packages."
          actions={<Button href="/studio" variant="secondary">Use in Super AgentOS</Button>}
        />
        <SearchBar value={search} onChange={event => setSearch(event.target.value)} placeholder="Search library assets" />
        <div className="library-toolbar">
          <FilterChips items={FILTERS.map(item => item.label)} active={FILTERS.find(item => item.key === filter)?.label ?? 'All'} onChange={label => setFilter(FILTERS.find(item => item.label === label)?.key ?? 'all')} />
          <div className="library-toolbar-controls">
            <label className="library-sort-control">
              <span>Sort</span>
              <Select value={sort} onChange={event => setSort(event.target.value as LibrarySort)} aria-label="Sort Library">
                <option value="recent">Recent</option>
                <option value="name">Name</option>
                <option value="type">Type</option>
                <option value="status">Status</option>
              </Select>
            </label>
            <div className="os-segmented-control" role="group" aria-label="Library view">
              <button type="button" className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')}>Grid</button>
              <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>List</button>
            </div>
          </div>
        </div>
        {payload ? (
          <div className="library-result-meta" aria-live="polite">
            <Badge tone="default">{items.length} shown</Badge>
            <span>{FILTERS.find(item => item.key === filter)?.label ?? 'All'} assets</span>
            <span>Sorted by {sort === 'recent' ? 'recent activity' : sort}</span>
          </div>
        ) : null}
        {message ? <Card><div className="os-entity-copy">{message}</div></Card> : null}

        {loading ? <LoadingState label="Loading library" /> : !payload ? (
          authState === 'expired'
            ? <EmptyState title="Session expired" body="Sign in again to view installed and saved assets." action={<Button href="/signin">Sign in again</Button>} />
            : <EmptyState title="Sign in required" body="Sign in to view installed and saved assets." action={<Button href="/signin">Sign in</Button>} />
        ) : items.length === 0 ? (
          <EmptyState title="No assets found" body="Install apps or skills, create projects or workflows, save outputs, or add files to populate Library." action={<Button href="/appstore">Open App Store</Button>} />
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
                    <span>{metadataLine(item)}</span>
                  </div>
                  {renderMetadata(item)}
                  {renderActions(item)}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <DataTable
            columns={['Asset', 'Type', 'Owner', 'Status', 'Permissions', 'Compatibility', 'Updated', '']}
            rows={items.map(item => [
              <div key={`${item.id}-asset`}>
                <div className="os-entity-title">{item.name}</div>
                <div className="os-entity-copy">{item.description}</div>
              </div>,
              formatKind(item.kind),
              ownerLabel(item),
              <Badge key={`${item.id}-status`} tone={installedStatus(item).toLowerCase().includes('active') || installedStatus(item).toLowerCase().includes('installed') ? 'success' : 'default'}>{installedStatus(item)}</Badge>,
              permissionLabel(item),
              compatibilityLabel(item),
              lastUsedDate(item),
              <div key={`${item.id}-actions`}>{renderActions(item)}</div>,
            ])}
          />
        )}
      </WorkspaceShell>
      <ConfirmationDialog
        open={Boolean(removeItem)}
        title={removeItem?.kind === 'installed_app' ? 'Uninstall app' : 'Remove skill from Library'}
        body={removeItem?.kind === 'installed_app'
          ? `Uninstall ${removeItem?.name ?? 'this app'} from this workspace and remove it from Library?`
          : `Remove ${removeItem?.name ?? 'this skill'} from Library, Studio skill picker, workflow skill nodes, and subagent skill attachments?`}
        confirmLabel={removeItem?.kind === 'installed_app' ? 'Uninstall' : 'Remove'}
        busy={Boolean(removeItem && workingAssetId === removeItem.id)}
        onCancel={() => setRemoveItem(null)}
        onConfirm={() => {
          if (!removeItem) return;
          if (removeItem.kind === 'installed_app') void removeApp(removeItem);
          else void removeSkill(removeItem);
        }}
      />
    </div>
  );
}
