'use client';

import { useCallback, useEffect, useState } from 'react';
import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import { useApplicationShell } from '@/components/os/application-shell';
import { fetchBrowserSessionState, fetchWithBrowserSession, type BrowserSessionAuthState } from '@/src/auth/browser-session';
import { Badge, Button, Card, ConfirmationDialog, DataTable, EmptyState, LoadingState, PageHeader, SearchBar } from '@/components/os/ui';

type InstalledApp = {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  runtimeType?: string;
  healthStatus?: string;
  installation?: {
    status: 'active' | 'disabled' | 'removed';
    favorite: boolean;
    openCount: number;
    updatedAt: string;
    updateAvailable?: boolean;
  };
};

export default function AppsPage() {
  const shell = useApplicationShell();
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [authState, setAuthState] = useState<BrowserSessionAuthState>('signed_out');
  const [search, setSearch] = useState('');
  const [working, setWorking] = useState('');
  const [message, setMessage] = useState('');
  const [pendingRemove, setPendingRemove] = useState<InstalledApp | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sessionState = await fetchBrowserSessionState().catch(() => ({ state: 'signed_out' as const, session: null }));
      setAuthState(sessionState.state);
      if (!sessionState.session) {
        setApps([]);
        return;
      }
      const { response, authState: nextAuthState } = await fetchWithBrowserSession(`/api/apps/installed${shell.activeWorkspaceId ? `?workspaceId=${encodeURIComponent(shell.activeWorkspaceId)}` : ''}`, { cache: 'no-store' });
      setAuthState(nextAuthState);
      const data = await response.json();
      setApps(response.ok ? data.installedApps ?? [] : []);
    } catch {
      setApps([]);
    } finally {
      setLoading(false);
    }
  }, [shell.activeWorkspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = apps.filter(app => !search || `${app.name} ${app.description} ${app.category}`.toLowerCase().includes(search.toLowerCase()));
  const active = apps.filter(app => app.installation?.status === 'active').length;
  const pinned = apps.filter(app => app.installation?.favorite === true).length;

  async function runAppAction(app: InstalledApp, action: 'open' | 'pin' | 'update' | 'remove') {
    setWorking(`${action}:${app.slug}`);
    setMessage('');
    try {
      const { response } = action === 'open'
        ? await fetchWithBrowserSession(`/api/apps/${app.slug}/open`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target: 'web' }),
        })
        : action === 'pin'
          ? await fetchWithBrowserSession(`/api/apps/${app.slug}/installation`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ favorite: !app.installation?.favorite }),
          })
          : action === 'update'
            ? await fetchWithBrowserSession('/api/apps/install', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ slug: app.slug, workspaceId: shell.activeWorkspaceId, permissionsApproved: [] }),
            })
            : await fetchWithBrowserSession(`/api/apps/${app.slug}/installation`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(payload.error ?? payload.message ?? `${action} failed.`);
        return;
      }
      if (action === 'open' && typeof payload.openUrl === 'string') window.open(payload.openUrl, '_blank', 'noopener,noreferrer');
      setMessage(action === 'open'
        ? `${app.name} opened.`
        : action === 'pin'
          ? `${app.name} ${app.installation?.favorite ? 'unpinned' : 'pinned'}.`
          : action === 'update'
            ? `${app.name} updated.`
            : `${app.name} removed.`);
      setPendingRemove(null);
      await load();
    } finally {
      setWorking('');
    }
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/apps" />
      <WorkspaceShell
        activePath="/apps"
        aside={(
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 12 }}>Installed</div>
            <div className="os-drawer-stack">
              <div className="os-entity-head"><span className="os-entity-copy">Active</span><Badge tone="success">{active}</Badge></div>
              <div className="os-entity-head"><span className="os-entity-copy">Pinned</span><Badge tone="accent">{pinned}</Badge></div>
              <div className="os-entity-head"><span className="os-entity-copy">Total</span><Badge tone="default">{apps.length}</Badge></div>
              <Button href="/appstore" variant="secondary">Open App Store</Button>
            </div>
          </Card>
        )}
      >
        <PageHeader
          eyebrow="Apps"
          title="Apps"
          subtitle="Installed app assets that extend Super AgentOS."
          actions={<Button href="/appstore">Install App</Button>}
        />
        <SearchBar value={search} onChange={event => setSearch(event.target.value)} placeholder="Search installed apps" />
        {message ? <Card><div className="os-entity-copy">{message}</div></Card> : null}

        {loading ? <LoadingState label="Loading apps" /> : authState === 'signed_out' || authState === 'expired' ? (
          <EmptyState title={authState === 'expired' ? 'Session expired' : 'Sign in required'} body="Sign in to manage installed apps." action={<Button href="/signin">{authState === 'expired' ? 'Sign in again' : 'Sign in'}</Button>} />
        ) : filtered.length === 0 ? (
          <EmptyState title="No installed apps" body="Use the App Store to install app surfaces for Super AgentOS." action={<Button href="/appstore">Open App Store</Button>} />
        ) : (
          <DataTable
            columns={['App', 'Runtime', 'Status', 'Opens', 'Actions']}
            rows={filtered.map(app => [
              <div key={`${app.id}-name`}>
                <div className="os-entity-title">{app.name}</div>
                <div className="os-entity-copy">{app.description}</div>
              </div>,
              app.runtimeType ?? app.category,
              app.installation?.favorite ? <Badge key={`${app.id}-status`} tone="accent">Pinned</Badge> : <Badge key={`${app.id}-status`} tone={app.installation?.status === 'disabled' ? 'warning' : 'success'}>{app.installation?.status ?? 'active'}</Badge>,
              String(app.installation?.openCount ?? 0),
              <div key={`${app.id}-actions`} className="os-inline-actions">
                <Button variant="secondary" onClick={() => void runAppAction(app, 'open')} loading={working === `open:${app.slug}`}>Open</Button>
                <Button variant="secondary" onClick={() => void runAppAction(app, 'update')} disabled={!app.installation?.updateAvailable} loading={working === `update:${app.slug}`}>Update</Button>
                <Button variant="secondary" onClick={() => void runAppAction(app, 'pin')} loading={working === `pin:${app.slug}`}>{app.installation?.favorite ? 'Unpin' : 'Pin'}</Button>
                <Button href={`/appstore/${app.slug}`} variant="secondary">Manage</Button>
                <Button variant="danger" onClick={() => setPendingRemove(app)}>Remove</Button>
              </div>,
            ])}
          />
        )}
      </WorkspaceShell>
      <ConfirmationDialog
        open={Boolean(pendingRemove)}
        title="Remove app"
        body={`Remove ${pendingRemove?.name ?? 'this app'} from this workspace? Ownership stays in Library history.`}
        confirmLabel="Remove"
        busy={Boolean(pendingRemove && working === `remove:${pendingRemove.slug}`)}
        onCancel={() => setPendingRemove(null)}
        onConfirm={() => pendingRemove ? void runAppAction(pendingRemove, 'remove') : undefined}
      />
    </div>
  );
}
