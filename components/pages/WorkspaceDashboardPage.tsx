'use client';

import { useCallback, useEffect, useState } from 'react';
import Nav from '@/components/Nav';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import {
  ActivityFeed,
  AppShell,
  Button,
  Card,
  EmptyState,
  LoadingState,
  MetricCard,
  PageHeader,
  SidebarNav,
  SidebarSection,
  StatusPill,
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
    subagents: number;
    vaultSecrets: number;
    sdkApps: number;
    ffpChains: number;
    recentEvents: number;
  };
  recentSessions: Array<{ id: string; title: string; status: string; updatedAt: string }>;
  activeProjects: Array<{ id: string; name: string; plan: string; href: string; createdAt: string }>;
  installedApps: Array<{ id: string; name: string; slug: string; description: string; healthStatus: string; openCount: number; favorite: boolean; href: string }>;
  installedSkills: Array<{ id: string; name: string; slug: string; category: string; description: string; installedAt: string }>;
  workflows: Array<{ id: string; name: string; summary: string; status: string; updatedAt: string }>;
  subagents: Array<{ id: string; name: string; description: string | null; status: string; updatedAt: string }>;
  vault: { total: number; active: number; names: string[] };
  sdkApps: Array<{ product: string; healthStatus: string; statusTopic: string; lastHeartbeatAt: string | null; lastError: string | null }>;
  ffp: { chainCount: number; chains: Array<{ chainId: string; executions: number; lastExecution: string | null }> } | null;
  recentEvents: Array<{ id: string; sessionId: string; type: string; summary: string; createdAt: string }>;
};

export default function WorkspaceDashboardPage() {
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);

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
      <AppShell
        sidebar={(
          <SidebarSection title="Workspace">
            <SidebarNav
              items={[
                { href: '/studio', label: 'Studio' },
                { href: '/dashboard', label: 'Overview', active: true },
                { href: '/projects', label: 'Projects' },
                { href: '/workflows', label: 'Workflows' },
                { href: '/vault', label: 'Vault' },
              ]}
            />
          </SidebarSection>
        )}
        aside={(
          <>
            <SidebarSection title="Quick actions">
              <div style={{ display: 'grid', gap: 10 }}>
                <Button href="/studio">Open Studio</Button>
                <Button href="/appstore" variant="secondary">Installed Apps</Button>
                <Button href="/vault" variant="secondary">Open Vault</Button>
                {enterprise ? <Button href="/developer" variant="secondary">Developer Console</Button> : null}
              </div>
            </SidebarSection>
            <SidebarSection title="Recent events">
              <ActivityFeed
                items={(payload?.recentEvents ?? []).slice(0, 6).map(event => ({
                  id: event.id,
                  title: event.type,
                  subtitle: event.summary,
                  time: new Date(event.createdAt).toLocaleString(),
                }))}
              />
            </SidebarSection>
          </>
        )}
      >
        <PageHeader
          eyebrow="Workspace Overview"
          title={payload?.workspace?.name ?? 'Workspace'}
          subtitle="Studio stays primary. Use this view for recent activity, installed runtime, vault status, and developer health."
          actions={<Button href="/studio">Return to Studio</Button>}
        />

        {loading ? <LoadingState label="Loading workspace overview" /> : !session ? (
          <EmptyState title="Sign in required" body="Sign in to view workspace sessions, apps, workflows, and vault status." action={<Button href="/signin">Sign in</Button>} />
        ) : !payload ? (
          <EmptyState title="Dashboard unavailable" body="The workspace overview route did not return data." />
        ) : (
          <div style={{ display: 'grid', gap: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
              <MetricCard label="Sessions" value={payload.summary.sessions} hint={payload.plan.label} />
              <MetricCard label="Projects" value={payload.summary.projects} />
              <MetricCard label="Installed apps" value={payload.summary.installedApps} />
              <MetricCard label="Installed skills" value={payload.summary.installedSkills} />
              <MetricCard label="Workflows" value={payload.summary.workflows} />
              <MetricCard label="Agents" value={payload.summary.subagents} />
              <MetricCard label="Vault secrets" value={payload.summary.vaultSecrets} />
              {enterprise ? <MetricCard label="SDK apps" value={payload.summary.sdkApps} /> : null}
              {enterprise ? <MetricCard label="FFP chains" value={payload.summary.ffpChains} /> : null}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <Card>
                <div className="os-entity-head" style={{ marginBottom: 12 }}>
                  <div className="os-entity-title">Recent sessions</div>
                  <Button href="/studio" variant="secondary">Open Studio</Button>
                </div>
                {payload.recentSessions.length === 0 ? (
                  <div className="os-empty-body">No studio sessions yet.</div>
                ) : (
                  <ActivityFeed items={payload.recentSessions.map(item => ({
                    id: item.id,
                    title: item.title,
                    subtitle: item.status,
                    time: new Date(item.updatedAt).toLocaleString(),
                  }))} />
                )}
              </Card>

              <Card>
                <div className="os-entity-head" style={{ marginBottom: 12 }}>
                  <div className="os-entity-title">Vault status</div>
                  <StatusPill status={`${payload.vault.active} active`} label={`${payload.vault.active} active`} />
                </div>
                <div className="os-entity-copy">Total secrets: {payload.vault.total}</div>
                <div className="os-entity-copy">Visible names: {payload.vault.names.join(', ') || 'None yet'}</div>
              </Card>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <Card>
                <div className="os-entity-head" style={{ marginBottom: 12 }}>
                  <div className="os-entity-title">Installed apps</div>
                  <Button href="/appstore" variant="secondary">App Store</Button>
                </div>
                {payload.installedApps.length === 0 ? (
                  <EmptyState title="No apps installed" body="Install apps from the App Store to make this workspace operational." action={<Button href="/appstore">Browse apps</Button>} />
                ) : (
                  <ActivityFeed items={payload.installedApps.map(item => ({
                    id: item.id,
                    title: item.name,
                    subtitle: `${item.description} - opens ${item.openCount}${item.favorite ? ' - pinned' : ''}`,
                    status: item.healthStatus,
                  }))} />
                )}
              </Card>

              <Card>
                <div className="os-entity-head" style={{ marginBottom: 12 }}>
                  <div className="os-entity-title">Installed skills</div>
                  <Button href="/skills" variant="secondary">Skills</Button>
                </div>
                {payload.installedSkills.length === 0 ? (
                  <div className="os-empty-body">No skills installed yet.</div>
                ) : (
                  <ActivityFeed items={payload.installedSkills.map(item => ({
                    id: item.id,
                    title: item.name,
                    subtitle: `${item.category} - ${item.description}`,
                    time: new Date(item.installedAt).toLocaleString(),
                  }))} />
                )}
              </Card>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <Card>
                <div className="os-entity-head" style={{ marginBottom: 12 }}>
                  <div className="os-entity-title">Workflows</div>
                  <Button href="/workflows" variant="secondary">Manage</Button>
                </div>
                {payload.workflows.length === 0 ? (
                  <div className="os-empty-body">No workflows yet.</div>
                ) : (
                  <ActivityFeed items={payload.workflows.map(item => ({
                    id: item.id,
                    title: item.name,
                    subtitle: item.summary,
                    status: item.status,
                    time: new Date(item.updatedAt).toLocaleString(),
                  }))} />
                )}
              </Card>

              <Card>
                <div className="os-entity-head" style={{ marginBottom: 12 }}>
                  <div className="os-entity-title">Private agents</div>
                  <Button href="/subagents" variant="secondary">Manage</Button>
                </div>
                {payload.subagents.length === 0 ? (
                  <div className="os-empty-body">No private agents yet.</div>
                ) : (
                  <ActivityFeed items={payload.subagents.map(item => ({
                    id: item.id,
                    title: item.name,
                    subtitle: item.description ?? 'Private subagent',
                    status: item.status,
                    time: new Date(item.updatedAt).toLocaleString(),
                  }))} />
                )}
              </Card>
            </div>

            {enterprise ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                <Card>
                  <div className="os-entity-head" style={{ marginBottom: 12 }}>
                    <div className="os-entity-title">SDK health</div>
                    <Button href="/sdk" variant="secondary">Open SDK</Button>
                  </div>
                  {payload.sdkApps.length === 0 ? (
                    <div className="os-empty-body">No SDK apps registered yet.</div>
                  ) : (
                    <ActivityFeed items={payload.sdkApps.map(item => ({
                      id: item.product,
                      title: item.product,
                      subtitle: item.statusTopic || 'Kernel status topic',
                      status: item.healthStatus,
                      time: item.lastHeartbeatAt ? new Date(item.lastHeartbeatAt).toLocaleString() : 'No heartbeat yet',
                    }))} />
                  )}
                </Card>

                <Card>
                  <div className="os-entity-head" style={{ marginBottom: 12 }}>
                    <div className="os-entity-title">FFP status</div>
                    <Button href="/ffp" variant="secondary">Open FFP</Button>
                  </div>
                  {!payload.ffp || payload.ffp.chains.length === 0 ? (
                    <div className="os-empty-body">No FFP chain activity yet.</div>
                  ) : (
                    <ActivityFeed items={payload.ffp.chains.map(item => ({
                      id: item.chainId,
                      title: item.chainId,
                      subtitle: `${item.executions} executions`,
                      time: item.lastExecution ? new Date(item.lastExecution).toLocaleString() : 'No executions yet',
                    }))} />
                  )}
                </Card>
              </div>
            ) : null}
          </div>
        )}
      </AppShell>
    </div>
  );
}
