'use client';

import { useCallback, useEffect, useState } from 'react';
import Nav from '@/components/Nav';
import { Drawer } from '@/components/os/overlays';
import WorkspaceShell from '@/components/os/workspace-shell';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import {
  ActivityFeed,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  MetricCard,
  PageHeader,
} from '@/components/os/ui';

type DashboardPayload = {
  workspace: { id: string; name: string; slug: string; plan: string } | null;
  plan: { plan: string; label: string; enterprise: boolean };
  summary: {
    sessions: number;
    projects: number;
    installedApps: number;
    installedSkills: number;
    workflows: number;
    vaultSecrets: number;
    sdkApps: number;
    ffpChains: number;
    mcpConnectors: number;
    recentEvents: number;
  };
  recentSessions: Array<{ id: string; title: string; status: string; updatedAt: string }>;
  installedApps: Array<{ id: string; name: string; slug: string; description: string; healthStatus: string; openCount: number; favorite: boolean; href: string }>;
  workflows: Array<{ id: string; name: string; summary: string; status: string; updatedAt: string }>;
  vault: { total: number; active: number; lastUsedAt: string | null };
  sdkApps: Array<{ product: string; healthStatus: string; statusTopic: string; lastHeartbeatAt: string | null; lastError: string | null }>;
  ffp: { chainCount: number; chains: Array<{ chainId: string; executions: number; lastExecution: string | null }> } | null;
  mcp: { connectorCount: number; activeConnectors: number; lastCallAt: string | null; connectors: Array<{ name: string; category: string; status: string }> };
  recentEvents: Array<{ id: string; sessionId: string; type: string; summary: string; createdAt: string }>;
};

type DrawerSection = 'sessions' | 'apps' | 'workflows' | 'vault' | 'events' | 'runtime' | null;

export default function WorkspaceDashboardPage() {
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState<DrawerSection>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [current, response] = await Promise.all([
        fetchBrowserSession().catch(() => null),
        fetch('/api/dashboard', { cache: 'no-store' }).catch(() => null),
      ]);
      setSession(current);
      if (!response?.ok) {
        setPayload(null);
        return;
      }
      setPayload(await response.json());
    } catch {
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const enterprise = payload?.plan.enterprise === true;

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/dashboard" />
      <WorkspaceShell
        activePath="/dashboard"
        aside={(
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 12 }}>Health</div>
            <div className="os-drawer-stack">
              <div className="os-entity-copy">Vault: {payload?.vault.active ?? 0}/{payload?.vault.total ?? 0} active</div>
              <div className="os-entity-copy">Connectors: {payload?.mcp.activeConnectors ?? 0}/{payload?.mcp.connectorCount ?? 0} active</div>
              {enterprise ? <div className="os-entity-copy">FFP chains: {payload?.ffp?.chainCount ?? 0}</div> : null}
            </div>
          </Card>
        )}
      >
        <PageHeader
          eyebrow="Dashboard"
          title={payload?.workspace?.name ?? 'Workspace'}
          subtitle="Recent sessions, installed apps, active workflows, Vault health, and runtime status."
          actions={<Button href="/studio">Open Studio</Button>}
        />

        {loading ? <LoadingState label="Loading dashboard" /> : !session ? (
          <EmptyState title="Sign in required" body="Sign in to view dashboard activity." action={<Button href="/signin">Sign in</Button>} />
        ) : !payload ? (
          <EmptyState title="Dashboard unavailable" body="The dashboard route did not return workspace data." />
        ) : (
          <div className="os-drawer-stack">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
              <MetricCard label="Recent sessions" value={payload.summary.sessions} hint={<button type="button" className="os-chip" onClick={() => setDrawer('sessions')}>Inspect</button>} />
              <MetricCard label="Installed apps" value={payload.summary.installedApps} hint={<button type="button" className="os-chip" onClick={() => setDrawer('apps')}>Inspect</button>} />
              <MetricCard label="Active workflows" value={payload.summary.workflows} hint={<button type="button" className="os-chip" onClick={() => setDrawer('workflows')}>Inspect</button>} />
              <MetricCard label="Vault health" value={`${payload.vault.active}/${payload.vault.total}`} hint={<button type="button" className="os-chip" onClick={() => setDrawer('vault')}>Inspect</button>} />
              <MetricCard label="Recent events" value={payload.summary.recentEvents} hint={<button type="button" className="os-chip" onClick={() => setDrawer('events')}>Inspect</button>} />
              {enterprise ? <MetricCard label="SDK apps" value={payload.summary.sdkApps} /> : null}
              {enterprise ? <MetricCard label="FFP chains" value={payload.summary.ffpChains} /> : null}
              <MetricCard label="MCP connectors" value={payload.summary.mcpConnectors} hint={<button type="button" className="os-chip" onClick={() => setDrawer('runtime')}>Inspect</button>} />
            </div>

            <Card>
              <div className="os-entity-head" style={{ marginBottom: 12 }}>
                <div className="os-entity-title">Recent sessions</div>
                <Button variant="secondary" onClick={() => setDrawer('sessions')}>View all</Button>
              </div>
              <ActivityFeed items={payload.recentSessions.slice(0, 4).map(item => ({
                id: item.id,
                title: item.title,
                subtitle: item.status,
                time: new Date(item.updatedAt).toLocaleString(),
              }))} />
            </Card>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <Card>
                <div className="os-entity-head" style={{ marginBottom: 12 }}>
                  <div className="os-entity-title">Installed apps</div>
                  <Button variant="secondary" onClick={() => setDrawer('apps')}>Inspect</Button>
                </div>
                <ActivityFeed items={payload.installedApps.slice(0, 4).map(item => ({
                  id: item.id,
                  title: item.name,
                  subtitle: item.description,
                  status: item.healthStatus,
                }))} />
              </Card>
              <Card>
                <div className="os-entity-head" style={{ marginBottom: 12 }}>
                  <div className="os-entity-title">Active workflows</div>
                  <Button variant="secondary" onClick={() => setDrawer('workflows')}>Inspect</Button>
                </div>
                <ActivityFeed items={payload.workflows.slice(0, 4).map(item => ({
                  id: item.id,
                  title: item.name,
                  subtitle: item.summary,
                  status: item.status,
                  time: new Date(item.updatedAt).toLocaleString(),
                }))} />
              </Card>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <Card>
                <div className="os-entity-head" style={{ marginBottom: 12 }}>
                  <div className="os-entity-title">Vault health</div>
                  <Badge tone="accent">{payload.vault.active} active</Badge>
                </div>
                <div className="os-entity-copy">Total secrets: {payload.vault.total}</div>
                <div className="os-entity-copy">Last update: {payload.vault.lastUsedAt ? new Date(payload.vault.lastUsedAt).toLocaleString() : 'No secrets yet'}</div>
              </Card>
              <Card>
                <div className="os-entity-head" style={{ marginBottom: 12 }}>
                  <div className="os-entity-title">Runtime health</div>
                  <Button variant="secondary" onClick={() => setDrawer('runtime')}>Inspect</Button>
                </div>
                <div className="os-entity-copy">Connectors: {payload.mcp.activeConnectors}/{payload.mcp.connectorCount} active</div>
                <div className="os-entity-copy">Last connector call: {payload.mcp.lastCallAt ? new Date(payload.mcp.lastCallAt).toLocaleString() : 'None'}</div>
                {enterprise ? <div className="os-entity-copy">FFP chains: {payload.ffp?.chainCount ?? 0}</div> : null}
              </Card>
            </div>
          </div>
        )}
      </WorkspaceShell>

      <Drawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        title={drawer === 'sessions' ? 'Recent sessions' : drawer === 'apps' ? 'Installed apps' : drawer === 'workflows' ? 'Active workflows' : drawer === 'vault' ? 'Vault health' : drawer === 'events' ? 'Recent events' : 'Runtime health'}
        description="Expanded dashboard details"
      >
        {!payload ? null : drawer === 'sessions' ? (
          <ActivityFeed items={payload.recentSessions.map(item => ({
            id: item.id,
            title: item.title,
            subtitle: item.status,
            time: new Date(item.updatedAt).toLocaleString(),
          }))} />
        ) : drawer === 'apps' ? (
          <ActivityFeed items={payload.installedApps.map(item => ({
            id: item.id,
            title: item.name,
            subtitle: `${item.description} | ${item.openCount} opens${item.favorite ? ' | favorite' : ''}`,
            status: item.healthStatus,
          }))} />
        ) : drawer === 'workflows' ? (
          <ActivityFeed items={payload.workflows.map(item => ({
            id: item.id,
            title: item.name,
            subtitle: item.summary,
            status: item.status,
            time: new Date(item.updatedAt).toLocaleString(),
          }))} />
        ) : drawer === 'vault' ? (
          <Card>
            <div className="os-entity-copy">Total secrets: {payload.vault.total}</div>
            <div className="os-entity-copy">Active secrets: {payload.vault.active}</div>
            <div className="os-entity-copy">Last update: {payload.vault.lastUsedAt ? new Date(payload.vault.lastUsedAt).toLocaleString() : 'None'}</div>
            <div className="os-inline-actions" style={{ marginTop: 12 }}>
              <Button href="/vault">Open Vault</Button>
            </div>
          </Card>
        ) : drawer === 'events' ? (
          <ActivityFeed items={payload.recentEvents.map(event => ({
            id: event.id,
            title: event.type,
            subtitle: event.summary,
            time: new Date(event.createdAt).toLocaleString(),
          }))} />
        ) : (
          <div className="os-drawer-stack">
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>MCP connectors</div>
              <ActivityFeed items={payload.mcp.connectors.map(item => ({
                id: item.name,
                title: item.name,
                subtitle: item.category,
                status: item.status,
              }))} />
            </Card>
            {enterprise ? (
              <Card>
                <div className="os-entity-title" style={{ marginBottom: 12 }}>FFP runtime</div>
                <ActivityFeed items={(payload.ffp?.chains ?? []).map(item => ({
                  id: item.chainId,
                  title: item.chainId,
                  subtitle: `${item.executions} executions`,
                  time: item.lastExecution ? new Date(item.lastExecution).toLocaleString() : 'No executions yet',
                }))} />
              </Card>
            ) : null}
            {enterprise ? (
              <Card>
                <div className="os-entity-title" style={{ marginBottom: 12 }}>SDK health</div>
                <ActivityFeed items={payload.sdkApps.map(item => ({
                  id: item.product,
                  title: item.product,
                  subtitle: item.statusTopic,
                  status: item.healthStatus,
                  time: item.lastHeartbeatAt ? new Date(item.lastHeartbeatAt).toLocaleString() : 'No heartbeat yet',
                }))} />
              </Card>
            ) : null}
          </div>
        )}
      </Drawer>
    </div>
  );
}
