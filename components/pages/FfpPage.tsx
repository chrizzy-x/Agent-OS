'use client';

import { useCallback, useEffect, useState } from 'react';
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

export default function FfpPage() {
  const [session, setSession] = useState<BrowserSession | null>(null);
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
      setSession(current);
      if (!current) {
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

  const enterprise = session?.accountType === 'enterprise' || session?.capabilities?.includes('access_sdk') === true;

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/ffp" />
      <AppShell
        activePath="/ffp"
        sidebar={(
          <SidebarSection title="FFP">
            <SidebarNav
              items={[
                { href: '/studio', label: 'Studio' },
                { href: '/ffp', label: 'FFP', active: true },
                { href: '/workflows', label: 'Workflows' },
                { href: '/appstore', label: 'Apps' },
              ]}
            />
          </SidebarSection>
        )}
        aside={(
          <SidebarSection title="Status">
            <div style={{ display: 'grid', gap: 10 }}>
              <Badge tone={chains.length > 0 ? 'accent' : 'default'}>{chains.length > 0 ? 'FFP active' : 'FFP idle'}</Badge>
              <div className="os-entity-copy">Operations: {operations.length}</div>
              <div className="os-entity-copy">Consensus proposals: {proposals.length}</div>
              <div className="os-entity-copy">Related workflows: {workflows.length}</div>
              <div className="os-entity-copy">Related apps: {apps.length}</div>
            </div>
          </SidebarSection>
        )}
      >
        <PageHeader
          eyebrow="FFP"
          title="Fabric Flow Protocol"
          subtitle="Consensus, audit chains, status panels, activity, logs, and related execution surfaces."
          actions={<Button href="/studio">Open Studio</Button>}
        />

        {loading ? <LoadingState label="Loading FFP" /> : !session ? (
          <EmptyState title="Sign in required" body="Sign in to inspect FFP operations and consensus history." action={<Button href="/signin">Sign in</Button>} />
        ) : !enterprise ? (
          <EmptyState title="Enterprise access required" body="FFP stays visible for enterprise-capable workspaces only." action={<Button href="/studio">Open Studio</Button>} />
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
              <MetricCard label="Sector chains" value={chains.length} />
              <MetricCard label="Operations" value={operations.length} />
              <MetricCard label="Consensus" value={proposals.length} />
              <MetricCard label="Tracked apps" value={apps.length} />
              <MetricCard label="Tracked workflows" value={workflows.length} />
              <MetricCard label="Studio sessions" value={sessions.length} />
            </div>

            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Sector chains</div>
              {chains.length === 0 ? (
                <div className="os-empty-body">No FFP chain activity yet.</div>
              ) : (
                <ActivityFeed items={chains.map(chain => ({
                  id: chain.chainId,
                  title: chain.chainId,
                  subtitle: `${chain.executions} executions | ${chain.successful} success | ${chain.failed} failed`,
                  time: chain.lastExecution ? new Date(chain.lastExecution).toLocaleString() : 'No executions yet',
                }))} />
              )}
            </Card>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <Card>
                <div className="os-entity-title" style={{ marginBottom: 12 }}>Activity view</div>
                {operations.length === 0 ? (
                  <div className="os-empty-body">No audited operations yet.</div>
                ) : (
                  <ActivityFeed items={operations.slice(0, 10).map((operation, index) => ({
                    id: String(operation.timestamp ?? index),
                    title: String(operation.action ?? operation.primitive ?? 'operation'),
                    subtitle: JSON.stringify(operation.params ?? {}).slice(0, 100),
                    time: typeof operation.timestamp === 'number' ? new Date(operation.timestamp).toLocaleString() : 'Recorded',
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
                    title: String(proposal.operation ?? proposal.status ?? 'proposal'),
                    subtitle: JSON.stringify(proposal.params ?? proposal.proposal ?? {}).slice(0, 100),
                    status: typeof proposal.status === 'string' ? proposal.status : undefined,
                  }))} />
                )}
              </Card>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <Card>
                <div className="os-entity-title" style={{ marginBottom: 12 }}>Related workflows</div>
                {workflows.length === 0 ? (
                  <div className="os-empty-body">No workflows connected to this workspace yet.</div>
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
                  <div className="os-empty-body">No installed apps linked to this workspace yet.</div>
                ) : (
                  <ActivityFeed items={apps.slice(0, 8).map(app => ({
                    id: app.id,
                    title: app.name,
                    subtitle: `${app.description} | opens ${app.openCount}`,
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
                  ...events.slice(0, 6).map(event => ({
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
