'use client';

import { useCallback, useEffect, useState } from 'react';
import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import {
  ActivityFeed,
  Button,
  Card,
  EmptyState,
  LoadingState,
  PageHeader,
} from '@/components/os/ui';

type AuditPayload = {
  recentEvents: Array<{ id: string; type: string; summary: string; createdAt: string }>;
  vaultHistory: Array<{ id: string; action: string; createdAt: string }>;
  connectors: Array<{ name: string; status: string }>;
};

export default function AuditPage() {
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [payload, setPayload] = useState<AuditPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sessionData, dashboardRes, vaultRes, connectorsRes] = await Promise.all([
        fetchBrowserSession().catch(() => null),
        fetch('/api/dashboard', { cache: 'no-store' }),
        fetch('/api/vault/history?limit=12', { cache: 'no-store' }).catch(() => null),
        fetch('/api/connectors', { cache: 'no-store' }).catch(() => null),
      ]);
      const dashboard = await dashboardRes.json();
      const vault = vaultRes?.ok ? await vaultRes.json() : { history: [] };
      const connectors = connectorsRes?.ok ? await connectorsRes.json() : { connectors: [] };
      setSession(sessionData);
      setPayload({
        recentEvents: dashboard.recentEvents ?? [],
        vaultHistory: (vault.history ?? []).map((item: { id: string; action: string; createdAt: string }) => ({
          id: item.id,
          action: item.action,
          createdAt: item.createdAt,
        })),
        connectors: (connectors.connectors ?? []).map((item: { name: string; healthStatus: string }) => ({
          name: item.name,
          status: item.healthStatus,
        })),
      });
    } catch {
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/audit" />
      <WorkspaceShell
        activePath="/audit"
        aside={(
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 12 }}>Quick links</div>
            <div className="os-drawer-stack">
              <Button href="/studio">Open Studio</Button>
              <Button href="/vault" variant="secondary">Open Vault</Button>
            </div>
          </Card>
        )}
      >
        <PageHeader
          eyebrow="Audit"
          title="Runtime audit surfaces"
          subtitle="Recent workspace events, vault access history, and connector health in one place."
        />

        {loading ? <LoadingState label="Loading audit" /> : !session ? (
          <EmptyState title="Sign in required" body="Sign in to inspect runtime audit activity." action={<Button href="/signin">Sign in</Button>} />
        ) : !payload ? (
          <EmptyState title="Audit unavailable" body="Audit data could not be loaded." />
        ) : (
          <div className="os-drawer-stack">
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Recent events</div>
              <ActivityFeed items={payload.recentEvents.map(event => ({
                id: event.id,
                title: event.type,
                subtitle: event.summary,
                time: new Date(event.createdAt).toLocaleString(),
              }))} />
            </Card>
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Vault history</div>
              <ActivityFeed items={payload.vaultHistory.map(item => ({
                id: item.id,
                title: item.action,
                time: new Date(item.createdAt).toLocaleString(),
              }))} />
            </Card>
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Connector health</div>
              <ActivityFeed items={payload.connectors.map(item => ({
                id: item.name,
                title: item.name,
                status: item.status,
              }))} />
            </Card>
          </div>
        )}
      </WorkspaceShell>
    </div>
  );
}
