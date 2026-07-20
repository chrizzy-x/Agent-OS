'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import { Drawer } from '@/components/os/overlays';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import {
  Badge,
  Button,
  Card,
  ComingSoonState,
  DataTable,
  EmptyState,
  Input,
  LoadingState,
  MetricCard,
  PageHeader,
  Tabs,
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

type Connector = {
  id: string;
  slug?: string;
  name: string;
  description?: string;
  category?: string;
  healthStatus: string;
  toolCount: number;
  callCount?: number;
  successCount?: number;
  failureCount?: number;
  lastCalledAt?: string | null;
  lastError?: string | null;
  accessSummary?: string;
  permissionScope?: string[];
  tools?: Array<{ name: string; description: string | null }>;
  lastAuditOutcome?: { success: boolean; timestamp: string | null; errorMessage: string | null; tool: string } | null;
  usedBy?: Array<{ type: string; id: string; name: string }>;
};

function formatDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : 'Never';
}

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
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'connectors' | 'tools' | 'logs'>('connectors');
  const [connectOpen, setConnectOpen] = useState(false);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);
  const [draftServer, setDraftServer] = useState('');
  const [draftEndpoint, setDraftEndpoint] = useState('');
  const [draftToken, setDraftToken] = useState('');

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
  const selectedConnector = useMemo(
    () => connectors.find(connector => connector.id === selectedConnectorId) ?? null,
    [connectors, selectedConnectorId],
  );

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
          title="Connectivity Hub"
          subtitle="Connected services, available tools, external agents, logs, and health indicators."
          actions={<Button onClick={() => setConnectOpen(true)}>Connect tool</Button>}
        />

        {loading ? <LoadingState label="Loading MCP diagnostics" /> : !payload ? (
          <EmptyState title="Diagnostics unavailable" body="The MCP registry could not be loaded." />
        ) : (
          <div className="os-drawer-stack">
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Layer boundary</div>
              <div className="os-entity-copy">Universal MCP connects external tools and agents. SDK apps are registered, verified, listed, installed, and monetized through the Appstore path.</div>
            </Card>

            <Tabs
              tabs={[
                { key: 'connectors', label: 'Connectors' },
                { key: 'tools', label: 'Tools' },
                { key: 'logs', label: 'Logs' },
              ]}
              active={activeView}
              onChange={key => setActiveView(key as typeof activeView)}
            />

            {activeView === 'connectors' ? (
              <>
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
                      <Card key={connector.id}>
                        <div className="os-entity-head">
                          <div>
                            <strong>{connector.name}</strong>
                            <div className="os-entity-copy">{connector.description ?? 'External MCP connector'}</div>
                          </div>
                          <Badge tone={connector.healthStatus === 'active' ? 'success' : connector.healthStatus === 'degraded' ? 'warning' : 'default'}>{connector.healthStatus}</Badge>
                        </div>
                        <div className="os-inline-actions" style={{ marginTop: 12 }}>
                          <Badge tone="accent">{connector.category ?? 'Connector'}</Badge>
                          <Badge tone="default">{connector.toolCount} tools</Badge>
                          <Badge tone={connector.failureCount ? 'warning' : 'success'}>{connector.callCount ?? 0} calls</Badge>
                        </div>
                        <div className="os-entity-copy" style={{ marginTop: 10 }}>Permissions: {(connector.permissionScope ?? []).join(', ') || 'No active subjects discovered.'}</div>
                        <div className="os-entity-copy">Last health check: {formatDate(connector.lastCalledAt)}</div>
                        {connector.lastError ? <div className="os-entity-copy">Last error: {connector.lastError}</div> : null}
                        <div className="os-inline-actions" style={{ marginTop: 12 }}>
                          <Button variant="secondary" onClick={() => setSelectedConnectorId(connector.id)}>Review</Button>
                          <Button variant="secondary" disabled disabledReason="Connector health checks are read from real MCP call history until active ping support is available.">Check health</Button>
                          <Button variant="danger" disabled disabledReason="Disconnect/revoke requires the MCP connection management backend.">Disconnect</Button>
                        </div>
                      </Card>
                    )) : <EmptyState title="No external services connected" body="Connect a tool when MCP server registration is available. Existing registered servers will appear here with health, permissions, and logs." />}
                  </div>
                </Card>
              </>
            ) : null}

            {activeView === 'tools' ? (
              <>
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
              </>
            ) : null}

            {activeView === 'logs' ? (
              <Card>
                <div className="os-entity-title" style={{ marginBottom: 12 }}>Recent MCP Logs</div>
                <DataTable
                  columns={['Connector', 'Tool', 'Outcome', 'Time', 'Error']}
                  rows={connectors.flatMap(connector => connector.lastAuditOutcome ? [[
                    connector.name,
                    connector.lastAuditOutcome.tool,
                    connector.lastAuditOutcome.success ? 'success' : 'failed',
                    formatDate(connector.lastAuditOutcome.timestamp),
                    connector.lastAuditOutcome.errorMessage ?? 'None',
                  ]] : [])}
                />
                {connectors.every(connector => !connector.lastAuditOutcome) ? <EmptyState title="No MCP logs yet" body="Logs appear after real MCP calls execute. AgentOS does not invent connector activity." /> : null}
              </Card>
            ) : null}
          </div>
        )}
      </WorkspaceShell>

      <Drawer
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        title="Connect external MCP tool"
        description="Register an external MCP server as a connector, not as an Appstore app."
        footer={<Button disabled disabledReason="MCP server registration backend is not available in this build. Existing registered connectors remain visible.">Save connector</Button>}
      >
        <div className="os-drawer-stack">
          <Input value={draftServer} onChange={event => setDraftServer(event.target.value)} placeholder="Connector name" />
          <Input value={draftEndpoint} onChange={event => setDraftEndpoint(event.target.value)} placeholder="MCP server URL" />
          <Input value={draftToken} onChange={event => setDraftToken(event.target.value)} placeholder="Access token" type="password" />
          <ComingSoonState title="Connection setup pending backend" body="This setup form is visible so the MCP layer is discoverable, but it stays disabled until AgentOS can persist and verify external MCP credentials safely." meta={<Badge tone="warning">Disabled</Badge>} />
        </div>
      </Drawer>

      <Drawer
        open={Boolean(selectedConnector)}
        onClose={() => setSelectedConnectorId(null)}
        title={selectedConnector?.name ?? 'Connector'}
        description="Health, permissions, tool list, and recent audited outcome."
      >
        {!selectedConnector ? null : (
          <div className="os-drawer-stack">
            <Card>
              <div className="os-inline-actions">
                <Badge tone={selectedConnector.healthStatus === 'active' ? 'success' : selectedConnector.healthStatus === 'degraded' ? 'warning' : 'default'}>{selectedConnector.healthStatus}</Badge>
                <Badge tone="accent">{selectedConnector.toolCount} tools</Badge>
              </div>
              <div className="os-entity-copy" style={{ marginTop: 10 }}>{selectedConnector.accessSummary ?? 'No active MCP use detected.'}</div>
            </Card>
            <Card>
              <div className="os-entity-title">Permission review</div>
              <div className="os-drawer-stack" style={{ marginTop: 10 }}>
                {(selectedConnector.permissionScope ?? []).length > 0 ? selectedConnector.permissionScope?.map(scope => <div key={scope} className="os-entity-copy">{scope}</div>) : <div className="os-empty-body">No permissioned subjects detected.</div>}
              </div>
            </Card>
            <Card>
              <div className="os-entity-title">Supported actions</div>
              <div className="os-drawer-stack" style={{ marginTop: 10 }}>
                {(selectedConnector.tools ?? []).length > 0 ? selectedConnector.tools?.map(tool => (
                  <div key={tool.name} className="os-entity-copy">{tool.name}: {tool.description ?? 'No description provided.'}</div>
                )) : <div className="os-empty-body">No tools reported by this connector.</div>}
              </div>
            </Card>
            <div className="os-inline-actions">
              <Button variant="secondary" disabled disabledReason="Live connector health checks require active MCP ping backend support.">Health check</Button>
              <Button variant="danger" disabled disabledReason="Disconnect/revoke requires MCP connection management backend support.">Disconnect</Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
