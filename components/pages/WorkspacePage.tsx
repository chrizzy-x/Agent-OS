'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Nav from '@/components/Nav';
import { useRouteDrawer } from '@/components/os/drawer-state';
import { Drawer } from '@/components/os/overlays';
import WorkspaceShell from '@/components/os/workspace-shell';
import { fetchBrowserSessionState, fetchWithBrowserSession, type BrowserSessionAuthState } from '@/src/auth/browser-session';
import { summarizeStudioEvent } from '@/src/ui/presenters';
import {
  ActivityFeed,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  MetricCard,
  PageHeader,
  SidebarNav,
  Textarea,
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
  recentSessions: Array<{ id: string; title: string; status: string; updatedAt: string; workspaceId?: string }>;
  activeProjects: Array<{ id: string; name: string; plan: string; href: string; createdAt: string }>;
  installedApps: Array<{ id: string; name: string; slug: string; description: string; healthStatus: string; openCount: number; favorite: boolean; href: string }>;
  installedSkills: Array<{ id: string; installedAt: string; name: string; slug: string; category: string; description: string }>;
  workflows: Array<{ id: string; name: string; summary: string; status: string; updatedAt: string }>;
  vault: { total: number; active: number; lastUsedAt: string | null };
  sdkApps: Array<{ product: string; healthStatus: string; statusTopic: string; lastHeartbeatAt: string | null; lastError: string | null }>;
  ffp: { chainCount: number; chains: Array<{ chainId: string; executions: number; lastExecution: string | null }> } | null;
  mcp: { connectorCount: number; activeConnectors: number; lastCallAt: string | null; connectors: Array<{ name: string; category: string; status: string }> };
  recentEvents: Array<{ id: string; sessionId: string; type: string; summary: string; createdAt: string }>;
};

type WorkspaceDetail = {
  workspace: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    role: string;
    metadata: Record<string, unknown>;
  };
};

type WorkspaceMember = {
  userId: string;
  name: string | null;
  email: string | null;
  role: string;
  joinedAt: string;
};

type WorkspaceAudit = {
  id: string;
  action: string;
  actorLabel: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type ProjectItem = {
  id: string;
  kind: string;
  name: string;
  description: string;
  status: string;
  href: string;
  workspaceId: string | null;
  updatedAt: string;
};

type SuperAgentPayload = {
  superAgent: {
    id: string;
    workspaceId: string;
    name: string;
    status: string;
    instructions: string;
    instructionVersion: number;
    updatedAt: string;
  } | null;
  summary: {
    activeSessions: number;
    installedSkills: number;
    connectedApps: number;
    privateWorkflows: number;
    recentActions: Array<{ id: string; type: string; summary: string; createdAt: string; sessionId: string | null }>;
  };
};

type WorkspaceDrawer =
  | 'workspace-projects'
  | 'workspace-sessions'
  | 'workspace-apps'
  | 'workspace-skills'
  | 'workspace-workflows'
  | 'workspace-agents'
  | 'workspace-members'
  | 'workspace-activity'
  | 'workspace-runtime'
  | 'workspace-settings';

export default function WorkspacePage() {
  const searchParams = useSearchParams();
  const drawer = useRouteDrawer<WorkspaceDrawer>();
  const requestedWorkspaceId = searchParams.get('workspace') ?? '';
  const [loading, setLoading] = useState(true);
  const [authState, setAuthState] = useState<BrowserSessionAuthState>('signed_out');
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [workspaceDetail, setWorkspaceDetail] = useState<WorkspaceDetail | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [audit, setAudit] = useState<WorkspaceAudit[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [superAgent, setSuperAgent] = useState<SuperAgentPayload | null>(null);
  const [superAgentInstructions, setSuperAgentInstructions] = useState('');
  const [settingsBusy, setSettingsBusy] = useState(false);

  const requestWithSession = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const result = await fetchWithBrowserSession(input, init);
    setAuthState(result.authState);
    return result.response;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sessionState = await fetchBrowserSessionState().catch(() => ({ state: 'signed_out' as const, session: null }));
      setAuthState(sessionState.state);
      if (!sessionState.session) {
        setPayload(null);
        setWorkspaceDetail(null);
        setMembers([]);
        setAudit([]);
        setProjects([]);
        return;
      }
      const dashboardRes = await requestWithSession(`/api/dashboard${requestedWorkspaceId ? `?workspace=${encodeURIComponent(requestedWorkspaceId)}` : ''}`, { cache: 'no-store' });
      if (!dashboardRes.ok) {
        setPayload(null);
        setWorkspaceDetail(null);
        setMembers([]);
        setAudit([]);
        setProjects([]);
        return;
      }
      const dashboardData = await dashboardRes.json();
      setPayload(dashboardData);

      const workspaceId = dashboardData.workspace?.id ?? requestedWorkspaceId;
      const [detailRes, membersRes, auditRes, projectsRes] = await Promise.all([
        workspaceId ? requestWithSession(`/api/workspaces/${workspaceId}`, { cache: 'no-store' }) : Promise.resolve(null),
        workspaceId ? requestWithSession(`/api/workspaces/${workspaceId}/members`, { cache: 'no-store' }) : Promise.resolve(null),
        workspaceId ? requestWithSession(`/api/workspaces/${workspaceId}/audit`, { cache: 'no-store' }) : Promise.resolve(null),
        requestWithSession('/api/projects', { cache: 'no-store' }),
      ]);

      setWorkspaceDetail(detailRes?.ok ? await detailRes.json() : null);
      setMembers(membersRes?.ok ? (await membersRes.json()).members ?? [] : []);
      setAudit(auditRes?.ok ? (await auditRes.json()).audit ?? [] : []);
      const projectsData = await projectsRes.json();
      const allProjects = (projectsData.projects ?? []) as ProjectItem[];
      setProjects(allProjects.filter(item => !workspaceId || item.workspaceId === workspaceId));
    } catch {
      setPayload(null);
      setWorkspaceDetail(null);
      setMembers([]);
      setAudit([]);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [requestWithSession, requestedWorkspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const workspaceId = payload?.workspace?.id ?? requestedWorkspaceId;
    if (!workspaceId) {
      setSuperAgent(null);
      setSuperAgentInstructions('');
      return;
    }
    let active = true;
    void requestWithSession(`/api/super-agent?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then((data: SuperAgentPayload) => {
        if (!active) return;
        if (!data) {
          setSuperAgent(null);
          setSuperAgentInstructions('');
          return;
        }
        setSuperAgent(data);
        setSuperAgentInstructions(data.superAgent?.instructions ?? '');
      })
      .catch(() => {
        if (!active) return;
        setSuperAgent(null);
        setSuperAgentInstructions('');
      });
    return () => {
      active = false;
    };
  }, [payload?.workspace?.id, requestWithSession, requestedWorkspaceId]);

  const agentProjects = useMemo(
    () => projects.filter(item => item.kind === 'agent'),
    [projects],
  );

  async function saveSuperAgentInstructions() {
    const workspaceId = payload?.workspace?.id ?? requestedWorkspaceId;
    if (!workspaceId) return;
    setSettingsBusy(true);
    try {
      const res = await requestWithSession('/api/super-agent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, instructions: superAgentInstructions }),
      });
      const data = await res.json();
      if (!res.ok) return;
      setSuperAgent(current => current ? { ...current, superAgent: data.superAgent ?? null } : { superAgent: data.superAgent ?? null, summary: { activeSessions: 0, installedSkills: 0, connectedApps: 0, privateWorkflows: 0, recentActions: [] } });
      setSuperAgentInstructions(data.superAgent?.instructions ?? '');
    } finally {
      setSettingsBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/workspace" />
      <WorkspaceShell activePath="/workspace" currentWorkspaceId={(payload?.workspace?.id ?? requestedWorkspaceId) || null} mobileTitle={payload?.workspace?.name ?? 'Workspace'}>
        <PageHeader
          eyebrow="Workspace"
          title={payload?.workspace?.name ?? 'Workspace'}
          subtitle="Projects, sessions, apps, skills, agents, vault, workflows, members, and runtime health in one workspace-first surface."
          actions={(
            <>
              <Button href="/studio">Open Studio</Button>
              <Button variant="secondary" onClick={() => drawer.openDrawer('workspace-members')}>Members</Button>
              <Button variant="secondary" onClick={() => drawer.openDrawer('workspace-settings')}>Settings</Button>
            </>
          )}
        />

        {loading ? <LoadingState label="Loading workspace" /> : !payload?.workspace ? (
          authState === 'expired'
            ? <EmptyState title="Session expired" body="Sign in again to load workspace data." action={<Button href="/signin">Sign in again</Button>} />
            : <EmptyState title="Sign in required" body="Sign in to load workspace data." action={<Button href="/signin">Sign in</Button>} />
        ) : (
          <div className="os-drawer-stack">
            <Card>
              <div className="os-entity-head" style={{ marginBottom: 12 }}>
                <div>
                  <div className="os-entity-title">Hierarchy</div>
                  <div className="os-entity-copy">Workspace / Projects / Sessions / Conversation / Execution</div>
                </div>
                <div className="os-inline-actions">
                  <Badge tone="accent">{payload.plan.label}</Badge>
                  <Badge tone="default">{workspaceDetail?.workspace.role ?? 'member'}</Badge>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                <MetricCard label="Projects" value={projects.length} hint={<button type="button" className="os-chip" onClick={() => drawer.openDrawer('workspace-projects')}>Inspect</button>} />
                <MetricCard label="Sessions" value={payload.summary.sessions} hint={<button type="button" className="os-chip" onClick={() => drawer.openDrawer('workspace-sessions')}>Inspect</button>} />
                <MetricCard label="Apps" value={payload.summary.installedApps} hint={<button type="button" className="os-chip" onClick={() => drawer.openDrawer('workspace-apps')}>Inspect</button>} />
                <MetricCard label="Skills" value={payload.summary.installedSkills} hint={<button type="button" className="os-chip" onClick={() => drawer.openDrawer('workspace-skills')}>Inspect</button>} />
                <MetricCard label="Workflows" value={payload.summary.workflows} hint={<button type="button" className="os-chip" onClick={() => drawer.openDrawer('workspace-workflows')}>Inspect</button>} />
                <MetricCard label="Vault" value={`${payload.vault.active}/${payload.vault.total}`} hint={<button type="button" className="os-chip" onClick={() => drawer.openDrawer('workspace-settings')}>Inspect</button>} />
              </div>
            </Card>

            <Card>
              <div className="os-entity-head" style={{ marginBottom: 12 }}>
                <div>
                  <div className="os-entity-title">Super AgentOS</div>
                  <div className="os-entity-copy">Your personal operating agent owns workspace sessions, memory, installed skills, connected apps, workflows, and routing decisions.</div>
                </div>
                <div className="os-inline-actions">
                  <Badge tone="accent">{superAgent?.superAgent?.status ?? 'active'}</Badge>
                  <Button variant="secondary" onClick={() => drawer.openDrawer('workspace-settings')}>Memory</Button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 16 }}>
                <MetricCard label="Active sessions" value={superAgent?.summary.activeSessions ?? payload.summary.sessions} />
                <MetricCard label="Installed skills" value={superAgent?.summary.installedSkills ?? payload.summary.installedSkills} />
                <MetricCard label="Connected apps" value={superAgent?.summary.connectedApps ?? payload.summary.installedApps} />
                <MetricCard label="Private workflows" value={superAgent?.summary.privateWorkflows ?? payload.summary.workflows} />
              </div>
              {superAgent?.superAgent?.instructions ? (
                <div className="os-entity-copy" style={{ marginBottom: 16 }}>{superAgent.superAgent.instructions}</div>
              ) : (
                <div className="os-entity-copy" style={{ marginBottom: 16 }}>No Super AgentOS instructions saved yet.</div>
              )}
              {(superAgent?.summary.recentActions ?? []).length > 0 ? (
                <ActivityFeed items={(superAgent?.summary.recentActions ?? []).map(item => ({
                  id: item.id,
                  title: item.type,
                  subtitle: item.summary,
                  time: item.createdAt ? new Date(item.createdAt).toLocaleString() : undefined,
                }))} />
              ) : (
                <div className="os-empty-body">No recent Super AgentOS actions yet.</div>
              )}
            </Card>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <Card>
                <div className="os-entity-head" style={{ marginBottom: 12 }}>
                  <div className="os-entity-title">Projects and agents</div>
                  <Button variant="secondary" onClick={() => drawer.openDrawer('workspace-projects')}>Open</Button>
                </div>
                <ActivityFeed items={projects.slice(0, 5).map(item => ({
                  id: item.id,
                  title: item.name,
                  subtitle: `${item.kind} | ${item.description}`,
                  status: item.status,
                  time: new Date(item.updatedAt).toLocaleString(),
                }))} />
              </Card>
              <Card>
                <div className="os-entity-head" style={{ marginBottom: 12 }}>
                  <div className="os-entity-title">Recent sessions</div>
                  <Button variant="secondary" onClick={() => drawer.openDrawer('workspace-sessions')}>Open</Button>
                </div>
                <ActivityFeed items={payload.recentSessions.map(item => ({
                  id: item.id,
                  title: item.title,
                  subtitle: item.status,
                  time: new Date(item.updatedAt).toLocaleString(),
                }))} />
              </Card>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <Card>
                <div className="os-entity-head" style={{ marginBottom: 12 }}>
                  <div className="os-entity-title">Apps and skills</div>
                  <div className="os-inline-actions">
                    <Button variant="secondary" onClick={() => drawer.openDrawer('workspace-apps')}>Apps</Button>
                    <Button variant="secondary" onClick={() => drawer.openDrawer('workspace-skills')}>Skills</Button>
                  </div>
                </div>
                <ActivityFeed items={payload.installedApps.slice(0, 4).map(item => ({
                  id: item.id,
                  title: item.name,
                  subtitle: item.description,
                  status: item.healthStatus,
                })).concat(payload.installedSkills.slice(0, 2).map(item => ({
                  id: item.id,
                  title: item.name,
                  subtitle: item.category,
                  status: 'installed',
                })))} />
              </Card>
              <Card>
                <div className="os-entity-head" style={{ marginBottom: 12 }}>
                  <div className="os-entity-title">Workflows and vault</div>
                  <div className="os-inline-actions">
                    <Button variant="secondary" onClick={() => drawer.openDrawer('workspace-workflows')}>Workflows</Button>
                    <Button variant="secondary" href="/vault">Vault</Button>
                  </div>
                </div>
                <ActivityFeed items={payload.workflows.slice(0, 4).map(item => ({
                  id: item.id,
                  title: item.name,
                  subtitle: item.summary,
                  status: item.status,
                  time: new Date(item.updatedAt).toLocaleString(),
                }))} />
                <div className="os-entity-copy" style={{ marginTop: 12 }}>Vault: {payload.vault.active} active secret assignments, last change {payload.vault.lastUsedAt ? new Date(payload.vault.lastUsedAt).toLocaleString() : 'not recorded'}.</div>
              </Card>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <Card>
                <div className="os-entity-head" style={{ marginBottom: 12 }}>
                  <div className="os-entity-title">Runtime</div>
                  <Button variant="secondary" onClick={() => drawer.openDrawer('workspace-runtime')}>Open</Button>
                </div>
                <div className="os-drawer-stack">
                  <div className="os-entity-copy">Connected MCP providers: {payload.mcp.activeConnectors}/{payload.mcp.connectorCount}</div>
                  <div className="os-entity-copy">FFP chains: {payload.ffp?.chainCount ?? 0}</div>
                  <div className="os-entity-copy">SDK apps: {payload.summary.sdkApps}</div>
                </div>
              </Card>
              <Card>
                <div className="os-entity-head" style={{ marginBottom: 12 }}>
                  <div className="os-entity-title">Members and activity</div>
                  <div className="os-inline-actions">
                    <Button variant="secondary" onClick={() => drawer.openDrawer('workspace-members')}>Members</Button>
                    <Button variant="secondary" onClick={() => drawer.openDrawer('workspace-activity')}>Activity</Button>
                  </div>
                </div>
                <div className="os-drawer-stack">
                  <div className="os-entity-copy">Members: {members.length}</div>
                  <div className="os-entity-copy">Agents: {agentProjects.length}</div>
                  <div className="os-entity-copy">Recent events: {payload.recentEvents.length}</div>
                </div>
              </Card>
            </div>
          </div>
        )}
      </WorkspaceShell>

      <Drawer
        open={Boolean(drawer.current)}
        onClose={drawer.closeDrawer}
        title={
          drawer.current?.id === 'workspace-projects' ? 'Projects'
            : drawer.current?.id === 'workspace-sessions' ? 'Sessions'
            : drawer.current?.id === 'workspace-apps' ? 'Installed apps'
            : drawer.current?.id === 'workspace-skills' ? 'Installed skills'
            : drawer.current?.id === 'workspace-workflows' ? 'Workflows'
            : drawer.current?.id === 'workspace-agents' ? 'Agents'
            : drawer.current?.id === 'workspace-members' ? 'Members'
            : drawer.current?.id === 'workspace-activity' ? 'Workspace activity'
            : drawer.current?.id === 'workspace-runtime' ? 'Runtime'
            : 'Workspace settings'
        }
        description="Workspace context"
      >
        {drawer.current?.id === 'workspace-projects' ? (
          <ActivityFeed items={projects.map(item => ({
            id: item.id,
            title: item.name,
            subtitle: `${item.kind} | ${item.description}`,
            status: item.status,
            time: new Date(item.updatedAt).toLocaleString(),
          }))} />
        ) : null}

        {drawer.current?.id === 'workspace-sessions' ? (
          <SidebarNav items={payload?.recentSessions.map(item => ({
            href: `/studio?session=${item.id}`,
            label: item.title,
            subtitle: `${item.status} | ${new Date(item.updatedAt).toLocaleString()}`,
          })) ?? []} />
        ) : null}

        {drawer.current?.id === 'workspace-apps' ? (
          <ActivityFeed items={payload?.installedApps.map(item => ({
            id: item.id,
            title: item.name,
            subtitle: item.description,
            status: item.healthStatus,
          })) ?? []} />
        ) : null}

        {drawer.current?.id === 'workspace-skills' ? (
          <ActivityFeed items={payload?.installedSkills.map(item => ({
            id: item.id,
            title: item.name,
            subtitle: item.category,
            time: new Date(item.installedAt).toLocaleString(),
          })) ?? []} />
        ) : null}

        {drawer.current?.id === 'workspace-workflows' ? (
          <ActivityFeed items={payload?.workflows.map(item => ({
            id: item.id,
            title: item.name,
            subtitle: item.summary,
            status: item.status,
            time: new Date(item.updatedAt).toLocaleString(),
          })) ?? []} />
        ) : null}

        {drawer.current?.id === 'workspace-agents' ? (
          <ActivityFeed items={agentProjects.map(item => ({
            id: item.id,
            title: item.name,
            subtitle: item.description,
            status: item.status,
            time: new Date(item.updatedAt).toLocaleString(),
          }))} />
        ) : null}

        {drawer.current?.id === 'workspace-members' ? (
          <ActivityFeed items={members.map(item => ({
            id: item.userId,
            title: item.name || item.email || item.userId,
            subtitle: item.role,
            time: new Date(item.joinedAt).toLocaleDateString(),
          }))} />
        ) : null}

        {drawer.current?.id === 'workspace-activity' ? (
          <ActivityFeed items={(audit.length > 0 ? audit : payload?.recentEvents ?? []).map(item => ({
            id: item.id,
            title: 'action' in item ? item.action : item.type,
            subtitle: 'summary' in item ? summarizeStudioEvent(item.type, { summary: item.summary }) : (item.actorLabel || summarizeStudioEvent(item.action, item.metadata)),
            time: new Date(item.createdAt).toLocaleString(),
          }))} />
        ) : null}

        {drawer.current?.id === 'workspace-runtime' ? (
          <div className="os-drawer-stack">
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Connected MCP providers</div>
              <ActivityFeed items={payload?.mcp.connectors.map(item => ({
                id: item.name,
                title: item.name,
                subtitle: item.category,
                status: item.status,
              })) ?? []} />
            </Card>
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>FFP</div>
              <ActivityFeed items={(payload?.ffp?.chains ?? []).map(item => ({
                id: item.chainId,
                title: item.chainId,
                subtitle: `${item.executions} executions`,
                time: item.lastExecution ? new Date(item.lastExecution).toLocaleString() : 'No executions yet',
              }))} />
            </Card>
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>SDK apps</div>
              <ActivityFeed items={(payload?.sdkApps ?? []).map(item => ({
                id: item.product,
                title: item.product,
                subtitle: item.statusTopic,
                status: item.healthStatus,
                time: item.lastHeartbeatAt ? new Date(item.lastHeartbeatAt).toLocaleString() : 'No heartbeat yet',
              }))} />
            </Card>
          </div>
        ) : null}

        {drawer.current?.id === 'workspace-settings' ? (
          <div className="os-drawer-stack">
            <Card>
              <div className="os-drawer-stack">
                <div className="os-entity-copy">Plan: {workspaceDetail?.workspace.plan ?? payload?.workspace?.plan ?? '-'}</div>
                <div className="os-entity-copy">Role: {workspaceDetail?.workspace.role ?? '-'}</div>
                <div className="os-entity-copy">Slug: {workspaceDetail?.workspace.slug ?? payload?.workspace?.slug ?? '-'}</div>
                <div className="os-inline-actions">
                  <Button href="/settings" variant="secondary">Open Settings</Button>
                  <Button href="/settings/team" variant="secondary">Open Team</Button>
                </div>
              </div>
            </Card>
            <Card>
              <div className="os-drawer-stack">
                <div className="os-entity-title">Super AgentOS memory and instructions</div>
                <div className="os-entity-copy">Instruction version: v{superAgent?.superAgent?.instructionVersion ?? 1}</div>
                <Textarea value={superAgentInstructions} onChange={event => setSuperAgentInstructions(event.target.value)} placeholder="Super AgentOS instructions" />
                <div className="os-inline-actions">
                  <Button variant="secondary" onClick={() => void saveSuperAgentInstructions()} disabled={settingsBusy}>{settingsBusy ? 'Saving...' : 'Save Super AgentOS instructions'}</Button>
                  <Badge tone="accent">{superAgent?.superAgent?.name ?? 'Super AgentOS'}</Badge>
                </div>
              </div>
            </Card>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
