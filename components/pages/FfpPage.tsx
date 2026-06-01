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

export default function FfpPage() {
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [chains, setChains] = useState<Chain[]>([]);
  const [operations, setOperations] = useState<Array<Record<string, unknown>>>([]);
  const [proposals, setProposals] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const current = await fetchBrowserSession().catch(() => null);
      setSession(current);
      if (!current) return;
      const [chainsRes, auditRes, consensusRes] = await Promise.all([
        fetch('/api/ffp/chains', { cache: 'no-store' }).catch(() => null),
        fetch('/api/agent/ffp/audit', { cache: 'no-store' }).catch(() => null),
        fetch('/api/agent/ffp/consensus', { cache: 'no-store' }).catch(() => null),
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
            </div>
          </SidebarSection>
        )}
      >
        <PageHeader
          eyebrow="FFP"
          title="Fabric Flow Protocol"
          subtitle="Consensus, audit chains, active operations, and execution history."
          actions={<Button href="/studio">Open Studio</Button>}
        />

        {loading ? <LoadingState label="Loading FFP" /> : !session ? (
          <EmptyState title="Sign in required" body="Sign in to inspect FFP operations and consensus history." action={<Button href="/signin">Sign in</Button>} />
        ) : !enterprise ? (
          <EmptyState title="Enterprise access required" body="FFP stays visible for enterprise-capable workspaces only." action={<Button href="/studio">Open Studio</Button>} />
        ) : (
          <>
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Sector chains</div>
              {chains.length === 0 ? (
                <div className="os-empty-body">No FFP chain activity yet.</div>
              ) : (
                <ActivityFeed items={chains.map(chain => ({
                  id: chain.chainId,
                  title: chain.chainId,
                  subtitle: `${chain.executions} executions · ${chain.successful} success · ${chain.failed} failed`,
                  time: chain.lastExecution ? new Date(chain.lastExecution).toLocaleString() : 'No executions yet',
                }))} />
              )}
            </Card>

            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Recent operations</div>
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
          </>
        )}
      </AppShell>
    </div>
  );
}
