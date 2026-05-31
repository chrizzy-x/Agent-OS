'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  SearchBar,
  SidebarNav,
  SidebarSection,
  Tabs,
  Textarea,
} from '@/components/os/ui';

type StudioSession = {
  id: string;
  workspaceId: string;
  title: string;
  updatedAt: string;
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

type Workflow = { id: string; name: string; summary: string | null; status: string; schedule: string | null };
type Subagent = { id: string; name: string; description: string | null };
type VaultSecret = { id: string; name: string; maskedValue: string };
type Workspace = { id: string; name: string };

type PendingPlan = {
  summary: string;
  confirmToken: string | null;
  steps: Array<{ order: number; tool: string; description: string }>;
};

const MODE_TABS = ['Chat', 'Plan', 'Workflow', 'Files', 'Memory'];
const CONTEXT_TABS = ['Context', 'Workflow', 'Memory', 'Logs', 'Settings'];
const QUICK_ACTIONS = ['Build Workflow', 'Install App', 'Add Secret', 'Create Agent', 'Analyze Data', 'Run Code', 'Generate Report'];

export default function StudioPage({ initialSessionId }: { initialSessionId?: string | null }) {
  const router = useRouter();
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<StudioSession[]>([]);
  const [messages, setMessages] = useState<StudioMessage[]>([]);
  const [events, setEvents] = useState<StudioEvent[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [subagents, setSubagents] = useState<Subagent[]>([]);
  const [vaultSecrets, setVaultSecrets] = useState<VaultSecret[]>([]);
  const [skills, setSkills] = useState<Array<{ skill?: { name?: string; slug?: string } }>>([]);
  const [activeMode, setActiveMode] = useState('Chat');
  const [contextTab, setContextTab] = useState('Context');
  const [prompt, setPrompt] = useState('');
  const [pendingPlan, setPendingPlan] = useState<PendingPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [activeSessionId, setActiveSessionId] = useState(initialSessionId ?? '');

  const activeSession = useMemo(
    () => sessions.find(item => item.id === activeSessionId) ?? sessions[0] ?? null,
    [activeSessionId, sessions],
  );

  const loadBundle = useCallback(async (sessionId: string) => {
    const res = await fetch(`/api/studio/sessions/${sessionId}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    setMessages(data.messages ?? []);
    setEvents(data.events ?? []);
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
      const [sessionsRes, workspacesRes, workflowsRes, subagentsRes, vaultRes, skillsRes] = await Promise.all([
        fetch('/api/studio/sessions', { cache: 'no-store' }),
        fetch('/api/workspaces', { cache: 'no-store' }),
        fetch('/api/agent/workflows', { cache: 'no-store' }),
        fetch('/api/subagents', { cache: 'no-store' }),
        fetch('/api/vault', { cache: 'no-store' }),
        fetch('/api/skills/installed', { cache: 'no-store' }),
      ]);
      const sessionsData = await sessionsRes.json();
      const workspacesData = await workspacesRes.json();
      const workflowsData = await workflowsRes.json();
      const subagentsData = await subagentsRes.json();
      const vaultData = await vaultRes.json();
      const skillsData = await skillsRes.json();
      const nextSessions = sessionsData.sessions ?? [];
      setSessions(nextSessions);
      setWorkspaces(workspacesData.workspaces ?? []);
      setWorkflows(workflowsData.workflows ?? []);
      setSubagents(subagentsData.subagents ?? []);
      setVaultSecrets(vaultData.secrets ?? []);
      setSkills(skillsData.installed_skills ?? []);

      const nextSessionId = activeSessionId || initialSessionId || nextSessions[0]?.id || '';
      if (nextSessionId) {
        setActiveSessionId(nextSessionId);
        await loadBundle(nextSessionId);
      }
    } catch {
      setSessions([]);
      setMessages([]);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [activeSessionId, initialSessionId, loadBundle, router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createSession() {
    if (!workspaces[0]) return;
    setBusy(true);
    try {
      const res = await fetch('/api/studio/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: workspaces[0].id, title: 'New Session' }),
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
      <AppShell
        activePath="/studio"
        sidebar={(
          <>
            <SidebarSection title="AgentOS">
              <Button onClick={() => void createSession()}>{busy ? 'Working...' : 'New Session'}</Button>
              <SearchBar placeholder="Search sessions" />
              <SidebarNav
                items={[
                  { href: '/studio', label: 'Studio', active: true },
                  { href: '/projects', label: 'Projects' },
                  { href: '/appstore', label: 'Apps' },
                  { href: '/workflows', label: 'Workflows' },
                  { href: '/vault', label: 'Vault' },
                  { href: '/skills', label: 'Skills' },
                ]}
              />
            </SidebarSection>
            <SidebarSection title="Recent sessions">
              <SidebarNav items={sessions.map(item => ({
                href: `/studio?session=${item.id}`,
                label: item.title,
                subtitle: new Date(item.updatedAt).toLocaleString(),
                active: activeSession?.id === item.id,
              }))} />
            </SidebarSection>
          </>
        )}
        aside={(
          <>
            <SidebarSection title="Context">
              <Tabs tabs={CONTEXT_TABS.map(item => ({ key: item, label: item }))} active={contextTab} onChange={setContextTab} />
              {contextTab === 'Context' ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div className="os-entity-copy">Attached apps: {workflows.slice(0, 2).map(item => item.name).join(' • ') || 'None'}</div>
                  <div className="os-entity-copy">Installed skills: {skills.map(item => item.skill?.name || item.skill?.slug || 'Skill').join(' • ') || 'None'}</div>
                  <div className="os-entity-copy">Secrets: {vaultSecrets.slice(0, 3).map(item => item.name).join(' • ') || 'None'}</div>
                </div>
              ) : null}
              {contextTab === 'Workflow' ? (
                <ActivityFeed items={workflows.slice(0, 4).map(item => ({
                  id: item.id,
                  title: item.name,
                  subtitle: item.summary ?? 'Workflow',
                  status: item.status,
                }))} />
              ) : null}
              {contextTab === 'Memory' ? (
                <div className="os-entity-copy">Session memory, user preferences, and project facts are available through Studio state and vault-backed context.</div>
              ) : null}
              {contextTab === 'Logs' ? (
                <ActivityFeed items={events.slice(-8).map(item => ({
                  id: item.id,
                  title: item.type,
                  subtitle: JSON.stringify(item.payload).slice(0, 80),
                  time: new Date(item.createdAt).toLocaleString(),
                }))} />
              ) : null}
              {contextTab === 'Settings' ? (
                <div className="os-entity-copy">Workspace: {workspaces[0]?.name ?? '—'} · Mode tabs and context panels are responsive on mobile.</div>
              ) : null}
            </SidebarSection>
          </>
        )}
      >
        <PageHeader
          eyebrow="Studio"
          title={activeSession?.title || 'Super AgentOS'}
          subtitle="Chat-first agent workspace with tools, workflows, apps, memory, and logs."
          actions={<Badge tone="accent">{session?.planLabel ?? 'Retail Free'}</Badge>}
        />

        <Tabs tabs={MODE_TABS.map(item => ({ key: item, label: item }))} active={activeMode} onChange={setActiveMode} />

        {loading ? <LoadingState label="Loading Studio" /> : !activeSession ? (
          <EmptyState title="No session selected" body="Create a new session to start using Studio." action={<Button onClick={() => void createSession()}>New Session</Button>} />
        ) : (
          <>
            <Card>
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
                {messages.length === 0 ? <div className="os-entity-copy">Start a new conversation in Studio.</div> : null}
              </div>
            </Card>

            {pendingPlan ? (
              <Card>
                <div className="os-entity-title" style={{ marginBottom: 12 }}>Plan preview</div>
                <div className="os-entity-copy" style={{ marginBottom: 12 }}>{pendingPlan.summary}</div>
                <ActivityFeed items={pendingPlan.steps.map(step => ({
                  id: `${step.order}-${step.tool}`,
                  title: step.tool,
                  subtitle: step.description,
                }))} />
                <div style={{ marginTop: 12 }}>
                  <Button onClick={() => void sendPrompt(true)}>{busy ? 'Running...' : 'Run plan'}</Button>
                </div>
              </Card>
            ) : null}

            <Card>
              <Textarea value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Ask AgentOS to build workflows, install apps, add secrets, or analyze data..." />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
                <div className="os-entity-copy">{subagents.length} agents · {workflows.length} workflows · {skills.length} skills</div>
                <Button onClick={() => void sendPrompt()}>{busy ? 'Sending...' : 'Send'}</Button>
              </div>
              {notice ? <div className="os-entity-copy" style={{ marginTop: 12 }}>{notice}</div> : null}
            </Card>
          </>
        )}
      </AppShell>
    </div>
  );
}
