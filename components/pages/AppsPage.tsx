'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import { fetchBrowserSessionState, fetchWithBrowserSession, type BrowserSessionAuthState } from '@/src/auth/browser-session';
import { Badge, Button, Card, DataTable, EmptyState, LoadingState, PageHeader, SearchBar } from '@/components/os/ui';

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
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [authState, setAuthState] = useState<BrowserSessionAuthState>('signed_out');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sessionState = await fetchBrowserSessionState().catch(() => ({ state: 'signed_out' as const, session: null }));
      setAuthState(sessionState.state);
      if (!sessionState.session) {
        setApps([]);
        return;
      }
      const { response, authState: nextAuthState } = await fetchWithBrowserSession('/api/apps/installed', { cache: 'no-store' });
      setAuthState(nextAuthState);
      const data = await response.json();
      setApps(response.ok ? data.installedApps ?? [] : []);
    } catch {
      setApps([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = apps.filter(app => !search || `${app.name} ${app.description} ${app.category}`.toLowerCase().includes(search.toLowerCase()));
  const active = apps.filter(app => app.installation?.status === 'active').length;
  const pinned = apps.filter(app => app.installation?.favorite === true).length;

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
                <Link href={`/appstore/${app.slug}`} className="btn-ghost">Open</Link>
                <Link href={`/appstore/${app.slug}`} className="btn-ghost">Update</Link>
                <Link href={`/appstore/${app.slug}`} className="btn-ghost">Pin</Link>
                <Link href={`/appstore/${app.slug}`} className="btn-ghost">Configure</Link>
                <Link href={`/appstore/${app.slug}`} className="btn-ghost">Remove</Link>
              </div>,
            ])}
          />
        )}
      </WorkspaceShell>
    </div>
  );
}
