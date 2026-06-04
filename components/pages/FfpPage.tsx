'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Nav from '@/components/Nav';
import { Drawer } from '@/components/os/overlays';
import { useRouteDrawer } from '@/components/os/drawer-state';
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

type FfpStatus = {
  enabled: boolean;
  chainId: string | null;
  nodeUrl: string | null;
  requireConsensus: boolean;
};

type FfpRoute = {
  id: string;
  chainId: string;
  proposalId: string | null;
  tool: string;
  primitive: string;
  input: Record<string, unknown>;
  result: Record<string, unknown>;
  status: string;
  errorMessage: string | null;
  consensusThreshold: number;
  validatorCount: number;
  inputHash: string | null;
  executedAt: string | null;
  fallbackUsed: boolean;
  fallbackReason?: string | null;
  invokedByType?: string | null;
  invokedById?: string | null;
  routeDecision?: Record<string, unknown>;
  related: {
    apps: Array<{ id: string; name: string; href: string; updatedAt: string | null }>;
    workflows: Array<{ id: string; name: string; href: string; updatedAt: string | null }>;
    skills: Array<{ id: string; name: string; href: string; updatedAt: string | null }>;
  };
};

type PrimitiveSummary = {
  id: string;
  primitive: string;
  executions: number;
  lastExecutedAt: string | null;
  latestTool: string;
  status: string;
  fallbackCount?: number;
};

type ConsensusProposal = Record<string, unknown>;
type AuditLog = Record<string, unknown>;

type DrawerId = 'route-detail' | 'primitive-detail' | 'ffp-logs';

function isEnterpriseSession(session: BrowserSession | null): boolean {
  return session?.accountType === 'enterprise' || session?.capabilities?.includes('access_sdk') === true;
}

function stringifyPreview(value: unknown): string {
  try {
    const preview = JSON.stringify(value);
    return preview.length > 180 ? `${preview.slice(0, 177)}...` : preview;
  } catch {
    return 'Unavailable';
  }
}

function formatDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : 'Not recorded';
}

function summarizeLinks(items: Array<{ name: string }>): string {
  return items.map(item => item.name).join(', ') || 'None linked';
}

export default function FfpPage() {
  const drawer = useRouteDrawer<DrawerId>();
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [status, setStatus] = useState<FfpStatus | null>(null);
  const [routes, setRoutes] = useState<FfpRoute[]>([]);
  const [primitives, setPrimitives] = useState<PrimitiveSummary[]>([]);
  const [proposals, setProposals] = useState<ConsensusProposal[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const current = await fetchBrowserSession().catch(() => null);
      setSession(current);
      if (!current) {
        setStatus(null);
        setRoutes([]);
        setPrimitives([]);
        setProposals([]);
        setLogs([]);
        return;
      }

      const enterprise = isEnterpriseSession(current);
      const [statusRes, routesRes, consensusRes, auditRes] = await Promise.all([
        fetch('/ffp/status', { cache: 'no-store' }).catch(() => null),
        fetch('/api/ffp/routes', { cache: 'no-store' }).catch(() => null),
        enterprise ? fetch('/api/agent/ffp/consensus', { cache: 'no-store' }).catch(() => null) : Promise.resolve(null),
        enterprise ? fetch('/api/agent/ffp/audit', { cache: 'no-store' }).catch(() => null) : Promise.resolve(null),
      ]);

      if (statusRes?.ok) {
        setStatus(await statusRes.json());
      } else {
        setStatus(null);
      }

      if (routesRes?.ok) {
        const payload = await routesRes.json();
        setRoutes(payload.routes ?? []);
        setPrimitives(payload.primitives ?? []);
      } else {
        setRoutes([]);
        setPrimitives([]);
      }

      if (consensusRes?.ok) {
        const payload = await consensusRes.json();
        setProposals(payload.proposals ?? []);
      } else {
        setProposals([]);
      }

      if (auditRes?.ok) {
        const payload = await auditRes.json();
        setLogs(payload.operations ?? []);
      } else {
        setLogs([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const enterprise = isEnterpriseSession(session);
  const selectedRoute = useMemo(
    () => routes.find(route => route.id === drawer.current?.entityId) ?? null,
    [drawer.current?.entityId, routes],
  );
  const selectedPrimitive = useMemo(
    () => primitives.find(primitive => primitive.id === drawer.current?.entityId) ?? null,
    [drawer.current?.entityId, primitives],
  );
  const primitiveRoutes = useMemo(
    () => selectedPrimitive ? routes.filter(route => route.primitive === selectedPrimitive.primitive).slice(0, 8) : [],
    [routes, selectedPrimitive],
  );
  const failedRoutes = useMemo(
    () => routes.filter(route => route.status.toLowerCase().includes('fail') || Boolean(route.errorMessage)),
    [routes],
  );
  const activeRoutes = useMemo(
    () => routes.filter(route => !route.status.toLowerCase().includes('fail')),
    [routes],
  );

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/ffp" />
      <WorkspaceShell
        activePath="/ffp"
        aside={(
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 12 }}>Runtime</div>
            <div className="os-drawer-stack">
              <Badge tone={status?.enabled ? 'success' : 'warning'}>{status?.enabled ? 'Enabled' : 'Disabled'}</Badge>
              <div className="os-entity-copy">Chain: {status?.chainId || 'Unconfigured'}</div>
              <div className="os-entity-copy">Consensus: {status?.requireConsensus ? 'Required' : 'Optional'}</div>
              <Button variant="secondary" onClick={() => drawer.openDrawer('ffp-logs', status?.chainId ?? 'runtime')}>Open logs</Button>
            </div>
          </Card>
        )}
      >
        <PageHeader
          eyebrow="FFP Router"
          title="Route inspection"
          subtitle="See what primitive handled each action, why it routed there, whether it succeeded, and what fallback or consensus state applied."
          actions={<Button href="/studio">Open Studio</Button>}
        />

        {loading ? <LoadingState label="Loading FFP" /> : !session ? (
          <EmptyState title="Sign in required" body="Sign in to inspect FFP routing and runtime activity." action={<Button href="/signin">Sign in</Button>} />
        ) : !enterprise ? (
          <EmptyState title="Enterprise access required" body="Retail workspaces only get high-level FFP health. Route inspection stays enterprise-only." action={<Button href="/studio">Open Studio</Button>} />
        ) : (
          <div className="os-drawer-stack">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
              <MetricCard label="Active routes" value={activeRoutes.length} />
              <MetricCard label="Failed routes" value={failedRoutes.length} />
              <MetricCard label="Fallback routes" value={routes.filter(route => route.fallbackUsed).length} />
              <MetricCard label="Primitives" value={primitives.length} />
              <MetricCard label="Consensus events" value={proposals.length} />
              <MetricCard label="Audit logs" value={logs.length} />
            </div>

            <Card>
              <div className="os-entity-head" style={{ marginBottom: 12 }}>
                <div className="os-entity-title">Recent routes</div>
                <Badge tone="accent">{routes.length}</Badge>
              </div>
              {routes.length === 0 ? (
                <div className="os-empty-body">No FFP route executions recorded yet.</div>
              ) : (
                <ActivityFeed items={routes.slice(0, 12).map(route => ({
                  id: route.id,
                  title: `${route.primitive} -> ${route.tool}`,
                  subtitle: `${route.chainId || 'no-chain'} | ${route.errorMessage ?? stringifyPreview(route.input)}`,
                  status: route.status,
                  time: formatDate(route.executedAt),
                }))} />
              )}
              {routes.length > 0 ? (
                <div className="os-inline-actions" style={{ marginTop: 12 }}>
                  {routes.slice(0, 3).map(route => (
                    <Button key={route.id} variant="secondary" onClick={() => drawer.openDrawer('route-detail', route.id)}>Inspect {route.primitive}</Button>
                  ))}
                </div>
              ) : null}
            </Card>

            <Card>
              <div className="os-entity-head" style={{ marginBottom: 12 }}>
                <div className="os-entity-title">Primitives</div>
                <Badge tone="default">{primitives.length}</Badge>
              </div>
              {primitives.length === 0 ? (
                <div className="os-empty-body">No primitives have routed through FFP yet.</div>
              ) : (
                <ActivityFeed items={primitives.map(primitive => ({
                  id: primitive.id,
                  title: primitive.primitive,
                  subtitle: `${primitive.executions} executions | ${primitive.latestTool}`,
                  status: primitive.status,
                  time: formatDate(primitive.lastExecutedAt),
                }))} />
              )}
              {primitives.length > 0 ? (
                <div className="os-inline-actions" style={{ marginTop: 12 }}>
                  {primitives.slice(0, 4).map(primitive => (
                    <Button key={primitive.id} variant="secondary" onClick={() => drawer.openDrawer('primitive-detail', primitive.id)}>Open {primitive.primitive}</Button>
                  ))}
                </div>
              ) : null}
            </Card>
          </div>
        )}
      </WorkspaceShell>

      <Drawer
        open={drawer.current?.id === 'route-detail'}
        onClose={drawer.closeDrawer}
        title={selectedRoute ? `${selectedRoute.primitive} route` : 'Route detail'}
        description="Route choice, execution path, related runtime subjects, and result preview."
        routeSafe
      >
        {!selectedRoute ? <EmptyState title="Route unavailable" body="This route record could not be loaded." /> : (
          <div className="os-drawer-stack">
            <Card>
              <div className="os-inline-actions">
                <Badge tone={selectedRoute.status.toLowerCase().includes('fail') ? 'danger' : 'success'}>{selectedRoute.status}</Badge>
                <Badge tone="accent">{selectedRoute.primitive}</Badge>
                {selectedRoute.fallbackUsed ? <Badge tone="warning">Fallback used</Badge> : null}
              </div>
              <div className="os-drawer-stack" style={{ marginTop: 12 }}>
                <div className="os-entity-copy">Tool: {selectedRoute.tool}</div>
                <div className="os-entity-copy">Chain: {selectedRoute.chainId || 'Unconfigured'}</div>
                <div className="os-entity-copy">Executed: {formatDate(selectedRoute.executedAt)}</div>
                <div className="os-entity-copy">Consensus threshold: {selectedRoute.consensusThreshold}</div>
                <div className="os-entity-copy">Validators: {selectedRoute.validatorCount}</div>
                {selectedRoute.inputHash ? <div className="os-entity-copy">Input hash: {selectedRoute.inputHash}</div> : null}
                {selectedRoute.invokedByType ? <div className="os-entity-copy">Invoked by: {selectedRoute.invokedByType} {selectedRoute.invokedById ? `(${selectedRoute.invokedById})` : ''}</div> : null}
                {selectedRoute.fallbackReason ? <div className="os-entity-copy">Fallback reason: {selectedRoute.fallbackReason}</div> : null}
                {selectedRoute.errorMessage ? <div className="os-entity-copy">Error: {selectedRoute.errorMessage}</div> : null}
              </div>
            </Card>
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Routing reason</div>
              <div className="os-entity-copy">{stringifyPreview(selectedRoute.routeDecision ?? selectedRoute.input)}</div>
            </Card>
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Execution result</div>
              <div className="os-entity-copy">{stringifyPreview(selectedRoute.result)}</div>
            </Card>
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Related runtime subjects</div>
              <div className="os-drawer-stack">
                <div className="os-entity-copy">Apps: {summarizeLinks(selectedRoute.related.apps)}</div>
                <div className="os-entity-copy">Workflows: {summarizeLinks(selectedRoute.related.workflows)}</div>
                <div className="os-entity-copy">Skills: {summarizeLinks(selectedRoute.related.skills)}</div>
              </div>
            </Card>
          </div>
        )}
      </Drawer>

      <Drawer
        open={drawer.current?.id === 'primitive-detail'}
        onClose={drawer.closeDrawer}
        title={selectedPrimitive?.primitive ?? 'Primitive detail'}
        description="Execution volume, latest route, and recent path outcomes for this primitive."
        routeSafe
      >
        {!selectedPrimitive ? <EmptyState title="Primitive unavailable" body="This primitive summary could not be loaded." /> : (
          <div className="os-drawer-stack">
            <Card>
              <div className="os-inline-actions">
                <Badge tone="accent">{selectedPrimitive.primitive}</Badge>
                <Badge tone={selectedPrimitive.status.toLowerCase().includes('fail') ? 'danger' : 'success'}>{selectedPrimitive.status}</Badge>
              </div>
              <div className="os-drawer-stack" style={{ marginTop: 12 }}>
                <div className="os-entity-copy">Executions: {selectedPrimitive.executions}</div>
                <div className="os-entity-copy">Latest tool: {selectedPrimitive.latestTool}</div>
                <div className="os-entity-copy">Last routed: {formatDate(selectedPrimitive.lastExecutedAt)}</div>
              </div>
            </Card>
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Recent paths</div>
              {primitiveRoutes.length === 0 ? (
                <div className="os-empty-body">No route records for this primitive yet.</div>
              ) : (
                <ActivityFeed items={primitiveRoutes.map(route => ({
                  id: route.id,
                  title: route.tool,
                  subtitle: route.errorMessage ?? stringifyPreview(route.input),
                  status: route.status,
                  time: formatDate(route.executedAt),
                }))} />
              )}
            </Card>
          </div>
        )}
      </Drawer>

      <Drawer
        open={drawer.current?.id === 'ffp-logs'}
        onClose={drawer.closeDrawer}
        title="FFP logs"
        description="Consensus events, audit logs, and failed routes."
        routeSafe
      >
        <div className="os-drawer-stack">
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 12 }}>Failed routes</div>
            {failedRoutes.length === 0 ? (
              <div className="os-empty-body">No failed routes recorded.</div>
            ) : (
              <ActivityFeed items={failedRoutes.slice(0, 12).map(route => ({
                id: route.id,
                title: route.tool,
                subtitle: route.errorMessage ?? stringifyPreview(route.result),
                status: route.status,
                time: formatDate(route.executedAt),
              }))} />
            )}
          </Card>
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 12 }}>Consensus state</div>
            {proposals.length === 0 ? (
              <div className="os-empty-body">No consensus proposals recorded.</div>
            ) : (
              <ActivityFeed items={proposals.slice(0, 12).map((proposal, index) => ({
                id: String(proposal.id ?? proposal.proposal_id ?? index),
                title: String(proposal.operation ?? proposal.type ?? 'proposal'),
                subtitle: stringifyPreview(proposal.params ?? proposal.proposal ?? proposal),
                status: typeof proposal.status === 'string' ? proposal.status : undefined,
                time: formatDate(typeof proposal.timestamp === 'string' ? proposal.timestamp : typeof proposal.created_at === 'string' ? proposal.created_at : null),
              }))} />
            )}
          </Card>
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 12 }}>Audit logs</div>
            {logs.length === 0 ? (
              <div className="os-empty-body">No audit logs recorded.</div>
            ) : (
              <ActivityFeed items={logs.slice(0, 12).map((entry, index) => ({
                id: String(entry.id ?? entry.timestamp ?? index),
                title: String(entry.action ?? entry.primitive ?? 'operation'),
                subtitle: stringifyPreview(entry.result ?? entry.params ?? entry),
                status: typeof entry.status === 'string' ? entry.status : undefined,
                time: formatDate(typeof entry.timestamp === 'string' ? entry.timestamp : null),
              }))} />
            )}
          </Card>
        </div>
      </Drawer>
    </div>
  );
}
