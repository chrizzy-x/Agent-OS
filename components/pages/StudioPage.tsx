'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import { useRouteDrawer } from '@/components/os/drawer-state';
import { Drawer } from '@/components/os/overlays';
import WorkspaceShell from '@/components/os/workspace-shell';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import { summarizeStudioEvent } from '@/src/ui/presenters';
import {
  ActivityFeed,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  PageHeader,
  SearchBar,
  SidebarNav,
  Textarea,
} from '@/components/os/ui';

type StudioSession = {
  id: string;
  workspaceId: string;
  title: string;
  updatedAt: string;
  parentSessionId?: string | null;
  branchLabel?: string | null;
  status?: string;
};

type StudioMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
};

type StudioEvent = {
  id: string;
  type: string;
  createdAt: string;
  payload: Record<string, unknown>;
};

type Workflow = {
  id: string;
  name: string;
  summary: string | null;
  status: string;
  schedule: string | null;
  graph_state?: Record<string, unknown>;
  code_state?: string | null;
  canonical_doc?: Record<string, unknown>;
};

type VaultSecret = { id: string; name: string; status?: string };
type Workspace = { id: string; name: string };
type SessionLineage = {
  parent: { id: string; title: string; updatedAt: string } | null;
  children: Array<{ id: string; title: string; updatedAt: string }>;
};

type PendingPlan = {
  summary: string;
  confirmToken: string | null;
  steps: Array<{ order: number; tool: string; description: string }>;
};

type StudioDrawerId = 'session-history' | 'workflow-graph' | 'workflow-code' | 'installed-skills' | 'installed-apps' | 'secrets' | 'logs' | 'settings';

const QUICK_ACTIONS = ['Build Workflow', 'Install App', 'Add Secret', 'Analyze Data', 'Run Code', 'Generate Report'];

export default function StudioPage({ initialSessionId, initialPrompt }: { initialSessionId?: string | null; initialPrompt?: string | null }) {
  const router = useRouter();
  const drawer = useRouteDrawer<StudioDrawerId>();
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<StudioSession[]>([]);
  const [messages, setMessages] = useState<StudioMessage[]>([]);
  const [events, setEvents] = useState<StudioEvent[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [vaultSecrets, setVaultSecrets] = useState<VaultSecret[]>([]);
  const [skills, setSkills] = useState<Array<{ skill?: { name?: string; slug?: string; category?: string } }>>([]);
  const [installedApps, setInstalledApps] = useState<Array<{ id: string; name: string; slug: string; description: string; healthStatus: string }>>([]);
  const [prompt, setPrompt] = useState('');
  const [pendingPlan, setPendingPlan] = useState<PendingPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [activeSessionId, setActiveSessionId] = useState(initialSessionId ?? '');
  const [lineage, setLineage] = useState<SessionLineage>({ parent: null, children: [] });
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [historySearch, setHistorySearch] = useState('');

  const activeSession = useMemo(
    () => sessions.find(item => item.id === activeSessionId) ?? sessions[0] ?? null,
    [activeSessionId, sessions],
  );
  const selectedWorkflow = useMemo(
    () => workflows.find(item => item.id === selectedWorkflowId) ?? workflows[0] ?? null,
    [selectedWorkflowId, workflows],
  );
  const filteredSessions = useMemo(
    () => sessions.filter(item => !historySearch || `${item.title} ${item.branchLabel ?? ''}`.toLowerCase().includes(historySearch.toLowerCase())),
    [historySearch, sessions],
  );
  const currentWorkspaceId = activeSession?.workspaceId ?? workspaces[0]?.id ?? null;
  const latestEvent = events.at(-1) ?? null;

  useEffect(() => {
    if (!activeSessionId) return undefined;
    const source = new EventSource(`/api/studio/sessions/${activeSessionId}/stream?cursor=${encodeURIComponent(events.at(-1)?.createdAt ?? new Date(0).toISOString())}`);
    const onMessage = (message: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(message.data) as StudioEvent;
        setEvents(current => current.some(event => event.id === payload.id) ? current : [...current, payload]);
      } catch {
        // ignore malformed events
      }
    };
    source.addEventListener('studio_event', onMessage as EventListener);
    return () => {
      source.removeEventListener('studio_event', onMessage as EventListener);
      source.close();
    };
  }, [activeSessionId, events]);

  useEffect(() => {
    if (initialPrompt?.trim()) setPrompt(initialPrompt);
  }, [initialPrompt]);

  const loadBundle = useCallback(async (sessionId: string) => {
    const res = await fetch(`/api/studio/sessions/${sessionId}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    setMessages(data.messages ?? []);
    setEvents(data.events ?? []);
    setLineage(data.lineage ?? { parent: null, children: [] });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const current = await fetchBrowserSession();
      if (!current) {
        router.replace('/signin');
        return;
      }
      setSession(current);
      const [sessionsRes, workspacesRes, workflowsRes, vaultRes, skillsRes, appsRes] = await Promise.all([
        fetch('/api/studio/sessions', { cache: 'no-store' }),
        fetch('/api/workspaces', { cache: 'no-store' }),
        fetch('/api/agent/workflows', { cache: 'no-store' }),
        fetch('/api/vault', { cache: 'no-store' }),
        fetch('/api/skills/installed', { cache: 'no-store' }),
        fetch('/api/apps/installed', { cache: 'no-store' }),
      ]);
      const sessionsData = await sessionsRes.json();
      const workspacesData = await workspacesRes.json();
      const workflowsData = await workflowsRes.json();
      const vaultData = await vaultRes.json();
      const skillsData = await skillsRes.json();
      const appsData = await appsRes.json();
      const nextSessions = sessionsData.sessions ?? [];
      const nextWorkflows = workflowsData.workflows ?? [];
      setSessions(nextSessions);
      setWorkspaces(workspacesData.workspaces ?? []);
      setWorkflows(nextWorkflows);
      setVaultSecrets(vaultData.secrets ?? []);
      setSkills(skillsData.installed_skills ?? []);
      setInstalledApps((appsData.installedApps ?? []).map((item: Record<string, unknown>) => ({
        id: String(item.id),
        name: String(item.name ?? 'App'),
        slug: String(item.slug ?? item.id),
        description: String(item.description ?? 'Installed app'),
        healthStatus: String(item.healthStatus ?? 'unknown'),
      })));
      if (!selectedWorkflowId && nextWorkflows[0]?.id) {
        setSelectedWorkflowId(nextWorkflows[0].id);
      }

      const nextSessionId = activeSessionId || initialSessionId || nextSessions[0]?.id || '';
      if (nextSessionId) {
        setActiveSessionId(nextSessionId);
        await loadBundle(nextSessionId);
      } else {
        setMessages([]);
        setEvents([]);
        setLineage({ parent: null, children: [] });
      }
    } catch {
      setSessions([]);
      setMessages([]);
      setEvents([]);
      setLineage({ parent: null, children: [] });
    } finally {
      setLoading(false);
    }
  }, [activeSessionId, initialSessionId, loadBundle, router, selectedWorkflowId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createSession() {
    if (!currentWorkspaceId) return;
    setBusy(true);
    try {
      const res = await fetch('/api/studio/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: currentWorkspaceId, title: 'New Session' }),
      });
      const data = await res.json();
      if (res.ok) {
        setActiveSessionId(data.session.id);
        router.replace(`/studio?session=${data.session.id}`);
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function branchSession() {
    if (!activeSession) return;
    setBusy(true);
    setNotice('');
    try {
      const res = await fetch(`/api/studio/sessions/${activeSession.id}/branch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${activeSession.title} Branch`,
          branchLabel: activeSession.title,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error ?? 'Branch failed');
        return;
      }
      setActiveSessionId(data.session.id);
      router.replace(`/studio?session=${data.session.id}`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function sendPrompt(confirm = false) {
    if (!activeSession || busy) return;
    if (!confirm && !prompt.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/studio/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(confirm
          ? { confirm: true, confirmToken: pendingPlan?.confirmToken, sessionId: activeSession.id }
          : { instruction: prompt, sessionId: activeSession.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error ?? 'Studio request failed');
        return;
      }
      if (confirm) {
        setPendingPlan(null);
        setPrompt('');
      } else {
        setPendingPlan({
          summary: data.summary ?? '',
          confirmToken: data.confirmToken ?? null,
          steps: data.steps ?? [],
        });
        setPrompt('');
      }
      await loadBundle(activeSession.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/studio" />
      <WorkspaceShell
        activePath="/studio"
        session={session}
        workspaces={workspaces}
        sessions={sessions}
        currentWorkspaceId={currentWorkspaceId}
        currentSessionId={activeSession?.id ?? null}
        mobileTitle={activeSession?.title ?? 'Studio'}
      >
        <PageHeader
          eyebrow="Studio"
          title={activeSession?.title || 'Super AgentOS'}
          subtitle="Conversation first. Planning and execution stay in context and only move forward when approved."
          actions={(
            <>
              <Button variant="secondary" onClick={() => void createSession()}>{busy ? 'Working...' : 'New session'}</Button>
              {activeSession ? <Button variant="secondary" onClick={() => void branchSession()}>{busy ? 'Working...' : 'Branch'}</Button> : null}
              <Button variant="secondary" onClick={() => drawer.openDrawer('session-history')}>Sessions</Button>
              <Button variant="secondary" onClick={() => drawer.openDrawer('logs')}>Logs</Button>
              <Badge tone="accent">{session?.planLabel ?? 'Retail Free'}</Badge>
            </>
          )}
        />

        {loading ? <LoadingState label="Loading Studio" /> : !activeSession ? (
          <EmptyState title="No session selected" body="Create a new session to start using Studio." action={<Button onClick={() => void createSession()}>New session</Button>} />
        ) : (
          <div className="os-drawer-stack">
            <Card>
              <div className="os-entity-head" style={{ marginBottom: 16 }}>
                <div>
                  <div className="os-entity-title">Conversation</div>
                  <div className="os-entity-copy">
                    Workspace {workspaces.find(item => item.id === activeSession.workspaceId)?.name ?? '-'} | {messages.length} messages | {lineage.children.length} branches
                  </div>
                  {latestEvent ? <div className="os-entity-meta" style={{ marginTop: 6 }}>Latest: {summarizeStudioEvent(latestEvent.type, latestEvent.payload)}</div> : null}
                </div>
                <div className="os-inline-actions">
                  <Button variant="secondary" onClick={() => drawer.openDrawer('workflow-graph')}>Workflow</Button>
                  <Button variant="secondary" onClick={() => drawer.openDrawer('workflow-code')}>Code</Button>
                  <Button variant="secondary" onClick={() => drawer.openDrawer('installed-apps')}>Apps</Button>
                  <Button variant="secondary" onClick={() => drawer.openDrawer('installed-skills')}>Skills</Button>
                  <Button variant="secondary" onClick={() => drawer.openDrawer('secrets')}>Vault</Button>
                  <Button variant="secondary" onClick={() => drawer.openDrawer('settings')}>Context</Button>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                {messages.map(message => (
                  <div
                    key={message.id}
                    style={{
                      marginLeft: message.role === 'user' ? 'auto' : 0,
                      maxWidth: '82%',
                      padding: '14px 16px',
                      borderRadius: 8,
                      border: `1px solid ${message.role === 'user' ? 'rgba(139, 92, 246, 0.26)' : 'var(--border)'}`,
                      background: message.role === 'user' ? 'rgba(139, 92, 246, 0.09)' : 'rgba(255, 255, 255, 0.02)',
                    }}
                  >
                    <div className="os-sidebar-title" style={{ marginBottom: 6 }}>{message.role}</div>
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{message.content}</div>
                  </div>
                ))}
                {pendingPlan ? (
                  <div
                    style={{
                      maxWidth: '82%',
                      padding: '14px 16px',
                      borderRadius: 8,
                      border: '1px solid rgba(139, 92, 246, 0.24)',
                      background: 'rgba(139, 92, 246, 0.08)',
                    }}
                  >
                    <div className="os-sidebar-title" style={{ marginBottom: 8 }}>Planning</div>
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{pendingPlan.summary}</div>
                    <ActivityFeed items={pendingPlan.steps.map(step => ({
                      id: `${step.order}-${step.tool}`,
                      title: step.tool,
                      subtitle: step.description,
                    }))} />
                    <div style={{ marginTop: 12 }}>
                      <Button onClick={() => void sendPrompt(true)}>{busy ? 'Running...' : 'Approve and run'}</Button>
                    </div>
                  </div>
                ) : null}
                {messages.length === 0 ? <div className="os-entity-copy">Start a new conversation in Studio.</div> : null}
              </div>
            </Card>

            <Card>
              <div className="os-entity-head" style={{ marginBottom: 12 }}>
                <div>
                  <div className="os-entity-title">Composer</div>
                  <div className="os-entity-copy">Use conversation for reasoning, planning, workflow changes, runtime installs, and workspace work.</div>
                </div>
                <div className="os-inline-actions">
                  <Badge tone="default">{workflows.length} workflows</Badge>
                  <Badge tone="default">{installedApps.length} apps</Badge>
                  <Badge tone="default">{skills.length} skills</Badge>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {QUICK_ACTIONS.map(item => (
                  <button
                    key={item}
                    type="button"
                    className="os-chip"
                    onClick={() => setPrompt(current => current ? `${current}\n${item}` : item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <Textarea value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Ask Super AgentOS to build workflows, install apps, add secrets, or analyze data..." />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
                <div className="os-entity-copy">{notice || 'Conversation stays in normal chat until approval is needed.'}</div>
                <Button onClick={() => void sendPrompt()}>{busy ? 'Sending...' : 'Send'}</Button>
              </div>
              {notice && latestEvent ? <div className="os-entity-meta" style={{ marginTop: 12 }}>{summarizeStudioEvent(latestEvent.type, latestEvent.payload)}</div> : null}
            </Card>
          </div>
        )}
      </WorkspaceShell>

      <Drawer
        open={Boolean(drawer.current)}
        onClose={drawer.closeDrawer}
        title={
          drawer.current?.id === 'session-history' ? 'Session history'
            : drawer.current?.id === 'workflow-graph' ? 'Workflow graph'
            : drawer.current?.id === 'workflow-code' ? 'Workflow code'
            : drawer.current?.id === 'installed-skills' ? 'Installed skills'
            : drawer.current?.id === 'installed-apps' ? 'Installed apps'
            : drawer.current?.id === 'secrets' ? 'Required secrets'
            : drawer.current?.id === 'logs' ? 'Event logs'
            : 'Settings'
        }
        description="Studio secondary controls"
      >
        {drawer.current?.id === 'session-history' ? (
          <>
            <SearchBar value={historySearch} onChange={event => setHistorySearch(event.target.value)} placeholder="Search sessions" />
            <SidebarNav items={filteredSessions.map(item => ({
              label: item.title,
              subtitle: item.branchLabel || item.status || new Date(item.updatedAt).toLocaleString(),
              active: item.id === activeSessionId,
              onClick: () => {
                setActiveSessionId(item.id);
                router.replace(`/studio?session=${item.id}`);
                drawer.closeDrawer();
                void loadBundle(item.id);
              },
            }))} />
            {lineage.parent || lineage.children.length ? (
              <Card>
                <div className="os-entity-title" style={{ marginBottom: 12 }}>Lineage</div>
                <div className="os-entity-copy">Parent: {lineage.parent ? lineage.parent.title : 'None'}</div>
                <ActivityFeed items={lineage.children.map(child => ({
                  id: child.id,
                  title: child.title,
                  subtitle: 'Branch',
                  time: new Date(child.updatedAt).toLocaleString(),
                }))} />
              </Card>
            ) : null}
          </>
        ) : null}

        {drawer.current?.id === 'workflow-graph' || drawer.current?.id === 'workflow-code' ? (
          <>
            <SidebarNav items={workflows.map(workflow => ({
              label: workflow.name,
              subtitle: workflow.summary ?? workflow.status,
              active: selectedWorkflow?.id === workflow.id,
              onClick: () => setSelectedWorkflowId(workflow.id),
            }))} />
            {selectedWorkflow ? (
              <Card>
                <div className="os-entity-title" style={{ marginBottom: 12 }}>{selectedWorkflow.name}</div>
                <div className="os-entity-copy" style={{ marginBottom: 12 }}>
                  {selectedWorkflow.summary || 'Developer detail for the selected workflow.'}
                </div>
                <pre className="os-code-block">
                  {drawer.current?.id === 'workflow-graph'
                    ? JSON.stringify(selectedWorkflow.graph_state ?? selectedWorkflow.canonical_doc ?? { nodes: [], edges: [] }, null, 2)
                    : selectedWorkflow.code_state || JSON.stringify(selectedWorkflow.canonical_doc ?? {}, null, 2)}
                </pre>
              </Card>
            ) : <EmptyState title="No workflows" body="No workflow is available in this workspace yet." />}
          </>
        ) : null}

        {drawer.current?.id === 'installed-skills' ? (
          <ActivityFeed items={skills.map((item, index) => ({
            id: `${item.skill?.slug ?? index}`,
            title: item.skill?.name ?? item.skill?.slug ?? 'Skill',
            subtitle: item.skill?.category ?? 'Installed skill',
          }))} />
        ) : null}

        {drawer.current?.id === 'installed-apps' ? (
          <ActivityFeed items={installedApps.map(item => ({
            id: item.id,
            title: item.name,
            subtitle: item.description,
            status: item.healthStatus,
          }))} />
        ) : null}

        {drawer.current?.id === 'secrets' ? (
          <ActivityFeed items={vaultSecrets.map(item => ({
            id: item.id,
            title: item.name,
            subtitle: item.status ?? 'active',
          }))} />
        ) : null}

        {drawer.current?.id === 'logs' ? (
          <ActivityFeed items={events.slice().reverse().map(item => ({
            id: item.id,
            title: item.type,
            subtitle: summarizeStudioEvent(item.type, item.payload),
            time: new Date(item.createdAt).toLocaleString(),
          }))} />
        ) : null}

        {drawer.current?.id === 'settings' ? (
          <Card>
            <div className="os-drawer-stack">
              <div className="os-entity-copy">Workspace: {workspaces.find(item => item.id === activeSession?.workspaceId)?.name ?? '-'}</div>
              <div className="os-entity-copy">Parent session: {lineage.parent?.title ?? 'None'}</div>
              <div className="os-entity-copy">Branches: {lineage.children.length}</div>
              <div className="os-inline-actions">
                <Button href="/settings" variant="secondary">Open Settings</Button>
              </div>
            </div>
          </Card>
        ) : null}
      </Drawer>
    </div>
  );
}
