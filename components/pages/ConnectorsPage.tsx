'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Nav from '@/components/Nav';
import { useRouteDrawer } from '@/components/os/drawer-state';
import { Drawer } from '@/components/os/overlays';
import WorkspaceShell from '@/components/os/workspace-shell';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import {
  AppCard,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  PageHeader,
  SearchBar,
} from '@/components/os/ui';

type Connector = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  icon: string | null;
  tools: Array<{ name: string; description: string | null }>;
  toolCount: number;
  requiresConsensus: boolean;
  consensusThreshold: number;
  healthStatus: string;
  lastCalledAt: string | null;
  lastError: string | null;
  callCount: number;
  successCount: number;
  failureCount: number;
  accessSummary: string;
  permissionScope?: {
    studio: boolean;
    apps: boolean;
    workflows: boolean;
    skills: boolean;
    externalAgents: boolean;
    requiresConsensus: boolean;
  };
  lastAuditOutcome?: {
    success: boolean;
    timestamp: string | null;
    errorMessage: string | null;
    tool: string | null;
  } | null;
  usedBy: {
    apps: Array<{ id: string; name: string; href: string; updatedAt: string | null }>;
    workflows: Array<{ id: string; name: string; href: string; updatedAt: string | null }>;
    skills: Array<{ id: string; name: string; href: string; updatedAt: string | null }>;
  };
};

type ConnectorDetail = {
  connector: Connector & {
    recentCalls: Array<{
      tool: string;
      params: Record<string, unknown>;
      result: Record<string, unknown>;
      success: boolean;
      errorMessage: string | null;
      executionTimeMs: number | null;
      timestamp: string | null;
    }>;
  };
};

function summarizeLinks(items: Array<{ name: string }>): string {
  return items.map(item => item.name).join(', ') || 'None linked';
}

export default function ConnectorsPage() {
  const drawer = useRouteDrawer<'connector-detail'>();
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [detail, setDetail] = useState<ConnectorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sessionData, connectorsRes] = await Promise.all([
        fetchBrowserSession().catch(() => null),
        fetch('/api/connectors', { cache: 'no-store' }),
      ]);
      const payload = await connectorsRes.json();
      setSession(sessionData);
      setConnectors(payload.connectors ?? []);
    } catch {
      setConnectors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (drawer.current?.id !== 'connector-detail' || !drawer.current.entityId) {
      setDetail(null);
      return;
    }
    let active = true;
    setDetailLoading(true);
    void fetch(`/api/connectors/${encodeURIComponent(drawer.current.entityId)}`, { cache: 'no-store' })
      .then(response => response.json())
      .then(payload => {
        if (active) setDetail(payload);
      })
      .catch(() => {
        if (active) setDetail(null);
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [drawer.current?.entityId, drawer.current?.id]);

  const filtered = useMemo(
    () => connectors.filter(connector => !search || `${connector.name} ${connector.description} ${connector.category}`.toLowerCase().includes(search.toLowerCase())),
    [connectors, search],
  );

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/connectors" />
      <WorkspaceShell
        activePath="/connectors"
        aside={(
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 12 }}>Summary</div>
            <div className="os-drawer-stack">
              <div className="os-entity-copy">Connectors: {connectors.length}</div>
              <div className="os-entity-copy">Healthy: {connectors.filter(item => item.healthStatus === 'active').length}</div>
              <div className="os-entity-copy">Guarded routes: {connectors.filter(item => item.requiresConsensus).length}</div>
            </div>
          </Card>
        )}
      >
        <PageHeader
          eyebrow="Universal MCP"
          title="Connectors"
          subtitle="Registry, health, permissions, and recent runtime usage for external MCP providers."
          actions={session?.capabilities?.includes('access_sdk') ? <Button href="/mcp" variant="secondary">Open Diagnostics</Button> : undefined}
        />

        <SearchBar value={search} onChange={event => setSearch(event.target.value)} placeholder="Search connectors" />

        {loading ? <LoadingState label="Loading connectors" /> : filtered.length === 0 ? (
          <EmptyState title="No connectors registered" body="Universal MCP is available, but no active connectors are registered in this workspace yet." />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            {filtered.map(connector => (
              <AppCard
                key={connector.id}
                title={connector.name}
                description={connector.description}
                runtime={connector.category}
                badge={connector.requiresConsensus ? <Badge tone="warning">FFP temp</Badge> : <Badge tone={connector.healthStatus === 'active' ? 'success' : connector.healthStatus === 'degraded' ? 'danger' : 'default'}>{connector.healthStatus}</Badge>}
                footer={(
                  <div className="os-inline-actions">
                    <span className="os-entity-meta">{connector.toolCount} tools | {connector.callCount} calls</span>
                    <Button variant="secondary" onClick={() => drawer.openDrawer('connector-detail', connector.slug)}>Inspect</Button>
                  </div>
                )}
              />
            ))}
          </div>
        )}
      </WorkspaceShell>

      <Drawer
        open={drawer.current?.id === 'connector-detail'}
        onClose={drawer.closeDrawer}
        title={detail?.connector.name ?? 'Connector'}
        description={detail?.connector.description ?? 'Connector details'}
        routeSafe
      >
        {detailLoading ? <LoadingState label="Loading connector details" /> : !detail ? (
          <EmptyState title="Connector unavailable" body="This connector could not be loaded." />
        ) : (
          <>
            <Card>
              <div className="os-inline-actions">
                <Badge tone={detail.connector.healthStatus === 'active' ? 'success' : detail.connector.healthStatus === 'degraded' ? 'danger' : 'default'}>{detail.connector.healthStatus}</Badge>
                <Badge tone="accent">{detail.connector.category}</Badge>
                {detail.connector.requiresConsensus ? <Badge tone="warning">FFP temp {detail.connector.consensusThreshold}</Badge> : null}
              </div>
              <div className="os-drawer-stack" style={{ marginTop: 12 }}>
                <div className="os-entity-copy">Access: {detail.connector.accessSummary}</div>
                <div className="os-entity-copy">Last call: {detail.connector.lastCalledAt ? new Date(detail.connector.lastCalledAt).toLocaleString() : 'No calls yet'}</div>
                {detail.connector.lastAuditOutcome?.tool ? <div className="os-entity-copy">Last audited tool: {detail.connector.lastAuditOutcome.tool}</div> : null}
                {detail.connector.lastAuditOutcome?.timestamp ? <div className="os-entity-copy">Last audit: {new Date(detail.connector.lastAuditOutcome.timestamp).toLocaleString()}</div> : null}
                {detail.connector.lastError ? <div className="os-entity-copy">Last error: {detail.connector.lastError}</div> : null}
              </div>
            </Card>
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Runtime linkage</div>
              <div className="os-drawer-stack">
                <div className="os-entity-copy">Apps: {summarizeLinks(detail.connector.usedBy.apps)}</div>
                <div className="os-entity-copy">Workflows: {summarizeLinks(detail.connector.usedBy.workflows)}</div>
                <div className="os-entity-copy">Skills: {summarizeLinks(detail.connector.usedBy.skills)}</div>
                {detail.connector.permissionScope ? <div className="os-entity-copy">Permission scope: {Object.entries(detail.connector.permissionScope).filter(([, value]) => value).map(([key]) => key).join(', ')}</div> : null}
              </div>
            </Card>
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Registered tools</div>
              <div className="os-drawer-stack">
                {detail.connector.tools.length === 0 ? <div className="os-empty-body">No tools registered.</div> : detail.connector.tools.map(tool => (
                  <Card key={tool.name}>
                    <div className="os-entity-title">{tool.name}</div>
                    <div className="os-entity-copy">{tool.description ?? 'No description provided.'}</div>
                  </Card>
                ))}
              </div>
            </Card>
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Recent calls</div>
              <div className="os-drawer-stack">
                {detail.connector.recentCalls.length === 0 ? <div className="os-empty-body">No calls recorded for this workspace.</div> : detail.connector.recentCalls.map((call, index) => (
                  <Card key={`${call.tool}-${call.timestamp ?? index}`}>
                    <div className="os-inline-actions">
                      <strong>{call.tool}</strong>
                      <Badge tone={call.success ? 'success' : 'danger'}>{call.success ? 'success' : 'failed'}</Badge>
                    </div>
                    <div className="os-entity-copy">{call.timestamp ? new Date(call.timestamp).toLocaleString() : 'Recorded'}</div>
                    {call.errorMessage ? <div className="os-entity-copy">Error: {call.errorMessage}</div> : null}
                  </Card>
                ))}
              </div>
            </Card>
          </>
        )}
      </Drawer>
    </div>
  );
}
