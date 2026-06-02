'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Nav from '@/components/Nav';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import {
  ActivityFeed,
  AppShell,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  MetricCard,
  PageHeader,
  SidebarNav,
  SidebarSection,
} from '@/components/os/ui';

type FfpStatus = {
  enabled: boolean;
  chainId: string | null;
  nodeUrl: string | null;
  requireConsensus: boolean;
};

type Chain = {
  chainId: string;
  executions: number;
  successful: number;
  failed: number;
  lastExecution: string | null;
};

type DashboardWorkflow = {
  id: string;
  name: string;
  summary: string;
  status: string;
  updatedAt: string;
};

type DashboardApp = {
  id: string;
  name: string;
  slug: string;
  description: string;
  healthStatus: string;
  openCount: number;
  favorite: boolean;
  href: string;
};

type DashboardEvent = {
  id: string;
  type: string;
  summary: string;
  createdAt: string;
};

type Session = {
  id: string;
  title: string;
  updatedAt: string;
};

function isEnterpriseSession(session: BrowserSession | null): boolean {
  return session?.accountType === 'enterprise' || session?.capabilities?.includes('access_sdk') === true;
}

function summarizePayload(value: unknown): string {
  if (!value || typeof value !== 'object') return 'No details';
  const preview = JSON.stringify(value);
  return preview.length > 120 ? `${preview.slice(0, 117)}...` : preview;
}

function formatTime(value: string | number | null | undefined): string {
  if (typeof value === 'string' && value.trim()) return new Date(value).toLocaleString();
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toLocaleString();
  return 'Recorded';
}

export default function FfpPage() {
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [status, setStatus] = useState<FfpStatus | null>(null);
  const [chains, setChains] = useState<Chain[]>([]);
  const [operations, setOperations] = useState<Array<Record<string, unknown>>>([]);
  const [proposals, setProposals] = useState<Array<Record<string, unknown>>>([]);
  const [workflows, setWorkflows] = useState<DashboardWorkflow[]>([]);
  const [apps, setApps] = useState<DashboardApp[]>([]);
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const current = await fetchBrowserSession().catch(() => null);
      const enterprise = isEnterpriseSession(current);
      setSession(current);

      if (!current) {
        setStatus(null);
        setChains([]);
        setOperations([]);
        setProposals([]);
        setWorkflows([]);
        setApps([]);
        setEvents([]);
        setSessions([]);
        return;
      }

      const statusRes = await fetch('/ffp/status', { cache: 'no-store' }).catch(() => null);
      if (statusRes?.ok) {
        const payload = await statusRes.json();
        setStatus(payload);
      } else {
        setStatus(null);
      }

      if (!enterprise) {
        setChains([]);
        setOperations([]);
        setProposals([]);
        setWorkflows([]);
        setApps([]);
        setEvents([]);
        setSessions([]);
        return;
      }

      const [chainsRes, auditRes, consensusRes, dashboardRes, sessionsRes] = await Promise.all([
        fetch('/api/ffp/chains', { cache: 'no-store' }).catch(() => null),
        fetch('/api/agent/ffp/audit', { cache: 'no-store' }).catch(() => null),
        fetch('/api/agent/ffp/consensus', { cache: 'no-store' }).catch(() => null),
        fetch('/api/dashboard', { cache: 'no-store' }).catch(() => null),
        fetch('/api/studio/sessions', { cache: 'no-store' }).catch(() => null),
      ]);

      if (chainsRes?.ok) {
        const payload = await chainsRes.json();
        setChains(payload.chains ?? []);
      } else {
        setChains([]);
      }

      if (auditRes?.ok) {
        const payload = await auditRes.json();
        setOperations(payload.operations ?? []);
      } else {
        setOperations([]);
      }

      if (consensusRes?.ok) {
        const payload = await consensusRes.json();
        setProposals(payload.proposals ?? []);
      } else {
        setProposals([]);
      }

      if (dashboardRes?.ok) {
        const payload = await dashboardRes.json();
        setWorkflows(payload.workflows ?? []);
        setApps(payload.installedApps ?? []);
        setEvents(payload.recentEvents ?? []);
      } else {
        setWorkflows([]);
        setApps([]);
        setEvents([]);
      }

      if (sessionsRes?.ok) {
        const payload = await sessionsRes.json();
        setSessions(payload.sessions ?? []);
      } else {
        setSessions([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const enterprise = isEnterpriseSession(session);
  const sidebarItems = useMemo(() => [
    { href: '/studio', label: 'Studio' },
    { href: '/ffp', label: 'FFP', active: true },
    { href: '/workflows', label: 'Workflows' },
    { href: '/appstore', label: 'Apps' },
    ...(enterprise ? [{ href: '/sdk', label: 'SDK' }, { href: '/developer', label: 'Developer' }] : []),
  ], [enterprise]);

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/ffp" />
      <AppShell
        activePath="/ffp"
        sidebar={(
          <SidebarSection title="FFP">
            <SidebarNav items={sidebarItems} />
          </SidebarSection>
        )}
        aside={(
          <SidebarSection title="Status">
            <div style={{ display: 'grid', gap: 10 }}>
              <Badge tone={enterprise ? 'accent' : 'default'}>{enterprise ? 'Enterprise FFP' : 'FFP visible'}</Badge>
              <Badge tone={status?.enabled ? 'success' : 'warning'}>{status?.enabled ? 'Runtime enabled' : 'Runtime disabled'}</Badge>
              <div className="os-entity-copy">Mode: {enterprise ? 'Operational' : 'Locked'}</div>
              <div className="os-entity-copy">Consensus: {status?.requireConsensus ? 'Required' : 'Optional'}</div>
              {enterprise ? (
                <>
                  <div className="os-entity-copy">Sector chains: {chains.length}</div>
                  <div className="os-entity-copy">Audit entries: {operations.length}</div>
                  <div className="os-entity-copy">Consensus proposals: {proposals.length}</div>
                </>
              ) : (
                <div className="os-entity-copy">Upgrade to inspect chains, audit history, and consensus logs.</div>
              )}
            </div>
          </SidebarSection>
        )}
      >
        <PageHeader
          eyebrow="FFP"
          title="Fabric Flow Protocol"
          subtitle="Runtime status, audit logs, consensus history, and workspace execution surfaces."
          actions={<Button href="/studio">Open Studio</Button>}
        />

        {loading ? <LoadingState label="Loading FFP" /> : !session ? (
          <EmptyState title="Sign in required" body="Sign in to view FFP status, audit logs, and related runtime activity." action={<Button href="/signin">Sign in</Button>} />
        ) : !enterprise ? (
          <EmptyState
            title="Enterprise access required"
            body={`FFP stays visible, but chain activity, consensus history, and developer controls stay locked outside enterprise workspaces. Runtime is currently ${status?.enabled ? 'enabled' : 'disabled'}.`}
            action={<Button href="/studio">Open Studio</Button>}
          />
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
              <MetricCard label="Runtime" value={status?.enabled ? 'Enabled' : 'Disabled'} hint={status?.nodeUrl ? 'Node connected' : 'No node configured'} />
              <MetricCard label="Consensus" value={status?.requireConsensus ? 'Required' : 'Optional'} />
              <MetricCard label="Sector chains" value={chains.length} />
              <MetricCard label="Audit entries" value={operations.length} />
              <MetricCard label="Proposals" value={proposals.length} />
              <MetricCard label="Related apps" value={apps.length} hint={`${workflows.length} workflows`} />
            </div>

            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Runtime status</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <Card>
                  <div className="os-sidebar-title">Mode</div>
                  <div className="os-entity-copy">{status?.enabled ? 'FFP enabled' : 'FFP disabled'}</div>
                </Card>
                <Card>
                  <div className="os-sidebar-title">Chain</div>
                  <div className="os-entity-copy">{status?.chainId || 'No chain configured'}</div>
                </Card>
                <Card>
                  <div className="os-sidebar-title">Node</div>
                  <div className="os-entity-copy">{status?.nodeUrl || 'No node configured'}</div>
                </Card>
                <Card>
                  <div className="os-sidebar-title">Consensus gate</div>
                  <div className="os-entity-copy">{status?.requireConsensus ? 'Required for execution' : 'Optional'}</div>
                </Card>
              </div>
            </Card>

            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Sector chains</div>
              {chains.length === 0 ? (
                <div className="os-empty-body">No FFP chain activity yet.</div>
              ) : (
                <ActivityFeed items={chains.map(chain => ({
                  id: chain.chainId,
                  title: chain.chainId,
                  subtitle: `${chain.executions} executions | ${chain.successful} successful | ${chain.failed} failed`,
                  time: chain.lastExecution ? new Date(chain.lastExecution).toLocaleString() : 'No executions yet',
                }))} />
              )}
            </Card>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <Card>
                <div className="os-entity-title" style={{ marginBottom: 12 }}>Audit history</div>
                {operations.length === 0 ? (
                  <div className="os-empty-body">No audited operations yet.</div>
                ) : (
                  <ActivityFeed items={operations.slice(0, 10).map((operation, index) => ({
                    id: String(operation.id ?? operation.timestamp ?? index),
                    title: String(operation.action ?? operation.primitive ?? 'operation'),
                    subtitle: summarizePayload(operation.params ?? operation.result ?? {}),
                    status: typeof operation.status === 'string' ? operation.status : undefined,
                    time: formatTime(
                      typeof operation.timestamp === 'string' || typeof operation.timestamp === 'number'
                        ? operation.timestamp
                        : null,
                    ),
                  }))} />
                )}
              </Card>

              <Card>
                <div className="os-entity-title" style={{ marginBottom: 12 }}>Consensus history</div>
                {proposals.length === 0 ? (
                  <div className="os-empty-body">No consensus proposals yet.</div>
                ) : (
                  <ActivityFeed items={proposals.slice(0, 10).map((proposal, index) => ({
                    id: String(proposal.id ?? proposal.proposal_id ?? index),
                    title: String(proposal.operation ?? proposal.type ?? 'proposal'),
                    subtitle: summarizePayload(proposal.params ?? proposal.proposal ?? {}),
                    status: typeof proposal.status === 'string' ? proposal.status : undefined,
                    time: formatTime(
                      typeof proposal.timestamp === 'string' || typeof proposal.timestamp === 'number'
                        ? proposal.timestamp
                        : typeof proposal.created_at === 'string' || typeof proposal.createdAt === 'string'
                          ? (proposal.created_at ?? proposal.createdAt) as string
                          : null,
                    ),
                  }))} />
                )}
              </Card>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <Card>
                <div className="os-entity-title" style={{ marginBottom: 12 }}>Related workflows</div>
                {workflows.length === 0 ? (
                  <div className="os-empty-body">No workspace workflows are linked to this runtime yet.</div>
                ) : (
                  <ActivityFeed items={workflows.slice(0, 8).map(workflow => ({
                    id: workflow.id,
                    title: workflow.name,
                    subtitle: workflow.summary,
                    status: workflow.status,
                    time: new Date(workflow.updatedAt).toLocaleString(),
                  }))} />
                )}
              </Card>

              <Card>
                <div className="os-entity-title" style={{ marginBottom: 12 }}>Related apps</div>
                {apps.length === 0 ? (
                  <div className="os-empty-body">No installed workspace apps are linked to this runtime yet.</div>
                ) : (
                  <ActivityFeed items={apps.slice(0, 8).map(app => ({
                    id: app.id,
                    title: app.name,
                    subtitle: `${app.description} | ${app.openCount} opens`,
                    status: app.healthStatus,
                  }))} />
                )}
              </Card>
            </div>

            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Logs</div>
              {events.length === 0 && sessions.length === 0 ? (
                <div className="os-empty-body">No session or workflow log activity yet.</div>
              ) : (
                <ActivityFeed items={[
                  ...events.slice(0, 8).map(event => ({
                    id: event.id,
                    title: event.type,
                    subtitle: event.summary,
                    time: new Date(event.createdAt).toLocaleString(),
                  })),
                  ...sessions.slice(0, 4).map(item => ({
                    id: item.id,
                    title: item.title,
                    subtitle: 'Studio session',
                    time: new Date(item.updatedAt).toLocaleString(),
                  })),
                ]} />
              )}
            </Card>
          </>
        )}
      </AppShell>
    </div>
  );
}
