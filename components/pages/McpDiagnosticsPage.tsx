'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  MetricCard,
  PageHeader,
} from '@/components/os/ui';

type McpRegistryPayload = {
  tools: Array<{
    name: string;
    title: string;
    description: string;
    source: 'primitive' | 'skill' | 'external';
    server: string;
    category: string;
    requires_consensus: boolean;
  }>;
  servers: Array<{
    name: string;
    description: string;
    category: string;
    icon: string | null;
    requires_consensus: boolean;
    consensus_threshold: number | null;
  }>;
};

function normalizeMcpPayload(value: unknown): McpRegistryPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Partial<McpRegistryPayload> & { error?: unknown };
  if (record.error && !Array.isArray(record.tools)) return null;
  return {
    tools: Array.isArray(record.tools) ? record.tools : [],
    servers: Array.isArray(record.servers) ? record.servers : [],
  };
}

export default function McpDiagnosticsPage() {
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [payload, setPayload] = useState<McpRegistryPayload | null>(null);
  const [externalAgents, setExternalAgents] = useState<Array<{ agentRef: string; name: string; status: string | null; last_active_at: string | null }>>([]);
  const [connectors, setConnectors] = useState<Array<{ id: string; name: string; healthStatus: string; toolCount: number }>>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sessionData, registryRes, agentsRes, connectorsRes] = await Promise.all([
        fetchBrowserSession().catch(() => null),
        fetch('/api/mcp', { cache: 'no-store' }),
        fetch('/api/agents', { cache: 'no-store' }),
        fetch('/api/connectors', { cache: 'no-store' }),
      ]);
      const registry = await registryRes.json();
      const agents = await agentsRes.json();
      const connectorPayload = await connectorsRes.json();
      setSession(sessionData);
      setPayload(registryRes.ok ? normalizeMcpPayload(registry) : null);
      setExternalAgents(agentsRes.ok ? agents.agents ?? [] : []);
      setConnectors(connectorsRes.ok ? connectorPayload.connectors ?? [] : []);
    } catch {
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isEnterprise = session?.accountType === 'enterprise' || session?.capabilities?.includes('access_sdk') === true;
  const sourceCounts = useMemo(() => ({
    primitives: payload?.tools.filter(tool => tool.source === 'primitive').length ?? 0,
    skills: payload?.tools.filter(tool => tool.source === 'skill').length ?? 0,
    external: payload?.tools.filter(tool => tool.source === 'external').length ?? 0,
  }), [payload]);

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/mcp" />
      <WorkspaceShell
        activePath="/mcp"
        aside={(
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 12 }}>Visibility</div>
            <div className="os-drawer-stack">
              <Badge tone={isEnterprise ? 'accent' : 'default'}>{isEnterprise ? 'Enterprise diagnostics' : 'Read-only health'}</Badge>
              <div className="os-entity-copy">Servers: {payload?.servers.length ?? 0}</div>
              <div className="os-entity-copy">Tools: {payload?.tools.length ?? 0}</div>
            </div>
          </Card>
        )}
      >
        <PageHeader
          eyebrow="Universal MCP"
          title="Diagnostics"
          subtitle="Registry-wide visibility into primitives, skills, external connectors, and workspace route guards."
          actions={<Button href="/connectors" variant="secondary">Open Connectors</Button>}
        />

        {loading ? <LoadingState label="Loading MCP diagnostics" /> : !payload ? (
          <EmptyState title="Diagnostics unavailable" body="The MCP registry could not be loaded." />
        ) : (
          <div className="os-drawer-stack">
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Connected Agents</div>
              <div className="os-drawer-stack">
                {externalAgents.length > 0 ? externalAgents.map(agent => (
                  <div key={agent.agentRef} className="os-entity-head">
                    <span className="os-entity-copy">{agent.name}</span>
                    <Badge tone={agent.status === 'active' ? 'success' : 'default'}>{agent.status ?? 'idle'}</Badge>
                  </div>
                )) : <div className="os-empty-body">No external agents connected.</div>}
              </div>
            </Card>

            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Connected Services</div>
              <div className="os-drawer-stack">
                {connectors.length > 0 ? connectors.map(connector => (
                  <div key={connector.id} className="os-entity-head">
                    <span className="os-entity-copy">{connector.name}</span>
                    <Badge tone={connector.healthStatus === 'active' ? 'success' : 'default'}>{connector.healthStatus}</Badge>
                  </div>
                )) : <div className="os-empty-body">No external services connected.</div>}
              </div>
            </Card>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
              <MetricCard label="Total tools" value={payload.tools.length} />
              <MetricCard label="Primitives" value={sourceCounts.primitives} />
              <MetricCard label="Skill tools" value={sourceCounts.skills} />
              <MetricCard label="External tools" value={sourceCounts.external} />
              <MetricCard label="Servers" value={payload.servers.length} />
            </div>

            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>External MCP Registry</div>
              <div className="os-drawer-stack">
                {payload.servers.length === 0 ? <div className="os-empty-body">No external connectors registered.</div> : payload.servers.map(server => (
                  <Card key={server.name}>
                    <div className="os-inline-actions">
                      <strong>{server.name}</strong>
                      <Badge tone="accent">{server.category}</Badge>
                      {server.requires_consensus ? <Badge tone="warning">FFP temp {server.consensus_threshold ?? 0}</Badge> : null}
                    </div>
                    <div className="os-entity-copy">{server.description}</div>
                  </Card>
                ))}
              </div>
            </Card>

            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Connected Tools</div>
              <div className="os-drawer-stack">
                {payload.tools.slice(0, 24).map(tool => (
                  <Card key={tool.name}>
                    <div className="os-inline-actions">
                      <strong>{tool.name}</strong>
                      <Badge tone={tool.source === 'primitive' ? 'default' : tool.source === 'skill' ? 'accent' : 'warning'}>{tool.source}</Badge>
                      {tool.requires_consensus ? <Badge tone="warning">FFP temp</Badge> : null}
                    </div>
                    <div className="os-entity-copy">{tool.description}</div>
                  </Card>
                ))}
              </div>
            </Card>
          </div>
        )}
      </WorkspaceShell>
    </div>
  );
}
