'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import { formatRedactedJson } from '@/src/auth/display-redaction';

type StudioSession = {
  id: string;
  workspaceId: string;
  superAgentId: string | null;
  title: string;
  state: Record<string, unknown>;
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
  payload: Record<string, unknown>;
  createdAt: string;
};

type Workflow = {
  id: string;
  name: string;
  summary: string | null;
  steps: Array<{ order: number; tool: string; description: string; input: Record<string, unknown> }>;
  graph_state?: { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> };
  code_state?: string;
  canonical_doc?: Record<string, unknown>;
  version?: number;
  status: string;
  schedule: string | null;
  last_result: unknown;
  last_error: string | null;
};

type Subagent = {
  id: string;
  name: string;
  description: string | null;
  instructions: string;
  status: string;
};

type VaultSecret = {
  id: string;
  name: string;
  maskedValue: string;
  status: string;
  version: number;
  updatedAt: string;
};

type Workspace = {
  id: string;
  name: string;
  plan: string;
};

type PendingPlan = {
  summary: string;
  confirmToken: string | null;
  steps: Array<{ order: number; tool: string; description: string; input: Record<string, unknown> }>;
  blocked?: boolean;
};

type Panel = 'workflow' | 'code' | 'subagents' | 'skills' | 'artifacts' | 'runs' | 'versions' | 'vault' | 'app';
type WorkflowMode = 'conversation' | 'visual' | 'code';
type VisualNode = {
  id: string;
  label: string;
  tool: string;
  description: string;
  inputText: string;
};
type VisualEdge = {
  id: string;
  source: string;
  target: string;
  condition: string;
};

const PANELS: Panel[] = ['workflow', 'code', 'subagents', 'skills', 'artifacts', 'runs', 'versions', 'vault'];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeTool(tool: string): string {
  const trimmed = tool.trim();
  if (!trimmed) return 'agentos.mem_get';
  return trimmed.startsWith('agentos.') ? trimmed : `agentos.${trimmed}`;
}

function createSequentialEdges(nodes: VisualNode[]): VisualEdge[] {
  if (nodes.length <= 1) return [];
  return nodes.slice(1).map((node, index) => ({
    id: `edge-${index + 1}`,
    source: nodes[index].id,
    target: node.id,
    condition: '',
  }));
}

function parseVisualGraph(workflow: Workflow | null): { nodes: VisualNode[]; edges: VisualEdge[] } {
  if (!workflow) return { nodes: [], edges: [] };
  const graph = asRecord(workflow.graph_state);
  const rawNodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const rawEdges = Array.isArray(graph.edges) ? graph.edges : [];

  if (rawNodes.length > 0) {
    const nodes = rawNodes.map((item, index) => {
      const row = asRecord(item);
      const input = asRecord(row.input);
      return {
        id: typeof row.id === 'string' && row.id.trim() ? row.id : `step-${index + 1}`,
        label: typeof row.label === 'string' && row.label.trim() ? row.label : `Step ${index + 1}`,
        tool: normalizeTool(typeof row.tool === 'string' ? row.tool : 'agentos.mem_get'),
        description: typeof row.description === 'string' && row.description.trim() ? row.description : `Step ${index + 1}`,
        inputText: formatRedactedJson(input),
      };
    });
    const edges = rawEdges
      .map(item => {
        const row = asRecord(item);
        if (typeof row.source !== 'string' || typeof row.target !== 'string') return null;
        return {
          id: typeof row.id === 'string' && row.id.trim() ? row.id : `edge-${Math.random().toString(16).slice(2, 8)}`,
          source: row.source,
          target: row.target,
          condition: typeof row.condition === 'string' ? row.condition : '',
        };
      })
      .filter((item): item is VisualEdge => Boolean(item));
    return { nodes, edges: edges.length > 0 ? edges : createSequentialEdges(nodes) };
  }

  if (workflow.steps.length > 0) {
    const nodes = workflow.steps.map((step, index) => ({
      id: `step-${step.order || index + 1}`,
      label: step.description || `Step ${index + 1}`,
      tool: normalizeTool(step.tool),
      description: step.description || `Step ${index + 1}`,
      inputText: formatRedactedJson(step.input ?? {}),
    }));
    return { nodes, edges: createSequentialEdges(nodes) };
  }

  return { nodes: [], edges: [] };
}

function timeLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function eventTone(type: string): { bg: string; color: string; border: string } {
  if (type.includes('blocked') || type.includes('denied') || type === 'task_failed') {
    return { bg: 'rgba(239,68,68,0.08)', color: '#fca5a5', border: 'rgba(239,68,68,0.26)' };
  }
  if (type.includes('secret') || type.includes('permission')) {
    return { bg: 'rgba(245,158,11,0.08)', color: '#fcd34d', border: 'rgba(245,158,11,0.26)' };
  }
  return { bg: 'rgba(34,197,94,0.06)', color: '#86efac', border: 'rgba(34,197,94,0.2)' };
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="terminal text-xs overflow-x-auto whitespace-pre-wrap break-all" style={{ padding: '12px', color: '#94a3b8' }}>
      {formatRedactedJson(value)}
    </pre>
  );
}

export default function StudioPage() {
  const router = useRouter();
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<StudioSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [messages, setMessages] = useState<StudioMessage[]>([]);
  const [events, setEvents] = useState<StudioEvent[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>('conversation');
  const [workflowCodeDraft, setWorkflowCodeDraft] = useState('');
  const [workflowStepsDraft, setWorkflowStepsDraft] = useState('');
  const [visualNodes, setVisualNodes] = useState<VisualNode[]>([]);
  const [visualEdges, setVisualEdges] = useState<VisualEdge[]>([]);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [subagents, setSubagents] = useState<Subagent[]>([]);
  const [vaultSecrets, setVaultSecrets] = useState<VaultSecret[]>([]);
  const [installedSkills, setInstalledSkills] = useState<Array<Record<string, unknown>>>([]);
  const [panel, setPanel] = useState<Panel>('workflow');
  const [prompt, setPrompt] = useState('');
  const [pendingPlan, setPendingPlan] = useState<PendingPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [subagentDraft, setSubagentDraft] = useState({ name: '', description: '', instructions: '' });
  const [secretDraft, setSecretDraft] = useState({ name: '', value: '' });

  const selectedSession = useMemo(
    () => sessions.find(item => item.id === selectedSessionId) ?? sessions[0] ?? null,
    [sessions, selectedSessionId],
  );
  const selectedWorkspace = useMemo(
    () => workspaces.find(item => item.id === selectedSession?.workspaceId) ?? workspaces[0] ?? null,
    [selectedSession?.workspaceId, workspaces],
  );
  const selectedWorkflow = useMemo(
    () => workflows.find(item => item.id === selectedWorkflowId) ?? workflows[0] ?? null,
    [selectedWorkflowId, workflows],
  );
  const canUseDeveloperConsole = session?.capabilities?.includes('access_developer_console') === true;
  const visiblePanels = canUseDeveloperConsole ? [...PANELS, 'app' as Panel] : PANELS;

  const loadBundle = useCallback(async (sessionId: string) => {
    const res = await fetch(`/api/studio/sessions/${sessionId}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    setMessages(data.messages ?? []);
    setEvents(data.events ?? []);
  }, []);

  const loadContext = useCallback(async () => {
    const [sessionsRes, workspacesRes, workflowsRes, subagentsRes, vaultRes, skillsRes] = await Promise.all([
      fetch('/api/studio/sessions', { cache: 'no-store' }),
      fetch('/api/workspaces', { cache: 'no-store' }),
      fetch('/api/agent/workflows', { cache: 'no-store' }),
      fetch('/api/subagents', { cache: 'no-store' }),
      fetch('/api/vault', { cache: 'no-store' }),
      fetch('/api/skills/installed', { cache: 'no-store' }),
    ]);

    const sessionsData = sessionsRes.ok ? await sessionsRes.json() : { sessions: [] };
    const workspacesData = workspacesRes.ok ? await workspacesRes.json() : { workspaces: [] };
    const workflowsData = workflowsRes.ok ? await workflowsRes.json() : { workflows: [] };
    const subagentsData = subagentsRes.ok ? await subagentsRes.json() : { subagents: [] };
    const vaultData = vaultRes.ok ? await vaultRes.json() : { secrets: [] };
    const skillsData = skillsRes.ok ? await skillsRes.json() : { installed_skills: [] };

    const nextSessions = sessionsData.sessions ?? [];
    setSessions(nextSessions);
    setWorkspaces(workspacesData.workspaces ?? []);
    const nextWorkflows = workflowsData.workflows ?? [];
    setWorkflows(nextWorkflows);
    if (nextWorkflows.length > 0) {
      const selectedId = selectedWorkflowId || nextWorkflows[0]?.id || '';
      setSelectedWorkflowId(selectedId);
    }
    setSubagents(subagentsData.subagents ?? []);
    setVaultSecrets(vaultData.secrets ?? []);
    setInstalledSkills(skillsData.installed_skills ?? []);

    const nextSelected = selectedSessionId || nextSessions[0]?.id || '';
    if (nextSelected) {
      setSelectedSessionId(nextSelected);
      await loadBundle(nextSelected);
    }
  }, [loadBundle, selectedSessionId, selectedWorkflowId]);

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      const current = await fetchBrowserSession();
      if (!active) return;
      if (!current) {
        router.replace('/signin');
        return;
      }
      setSession(current);
      await loadContext();
      if (active) setLoading(false);
    }
    void bootstrap();
    return () => { active = false; };
  }, [loadContext, router]);

  useEffect(() => {
    if (!selectedSession?.id) return undefined;
    const source = new EventSource(`/api/studio/sessions/${selectedSession.id}/stream`);

    const onStudioEvent = (raw: Event) => {
      const message = raw as MessageEvent<string>;
      try {
        const event = JSON.parse(message.data) as StudioEvent;
        setEvents(prev => {
          if (prev.some(item => item.id === event.id)) return prev;
          return [...prev, event];
        });
      } catch {
        // ignore malformed events
      }
    };

    source.addEventListener('studio_event', onStudioEvent);
    source.onerror = () => {
      source.close();
    };

    return () => {
      source.removeEventListener('studio_event', onStudioEvent);
      source.close();
    };
  }, [selectedSession?.id]);

  useEffect(() => {
    if (!selectedWorkflow) {
      setWorkflowCodeDraft('');
      setWorkflowStepsDraft('');
      setVisualNodes([]);
      setVisualEdges([]);
      return;
    }
    const codeState = typeof selectedWorkflow.code_state === 'string' && selectedWorkflow.code_state.trim()
      ? selectedWorkflow.code_state
      : formatRedactedJson(selectedWorkflow.canonical_doc ?? { steps: selectedWorkflow.steps ?? [] });
    setWorkflowCodeDraft(codeState);
    setWorkflowStepsDraft(formatRedactedJson(selectedWorkflow.steps ?? []));
    const visual = parseVisualGraph(selectedWorkflow);
    setVisualNodes(visual.nodes);
    setVisualEdges(visual.edges);
  }, [selectedWorkflow]);

  async function sendPrompt() {
    const trimmed = prompt.trim();
    if (!trimmed || !selectedSession || busy) return;
    setBusy(true);
    setNotice('');
    setPendingPlan(null);
    try {
      const res = await fetch('/api/studio/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: trimmed, sessionId: selectedSession.id }),
      });
      const data = await res.json();
      setPrompt('');
      setPendingPlan({
        summary: data.summary ?? data.error ?? 'Studio request failed.',
        confirmToken: data.confirmToken ?? null,
        steps: data.steps ?? [],
        blocked: !res.ok || data.blocked === true,
      });
      await loadBundle(selectedSession.id);
    } catch {
      setNotice('Studio request failed. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function createSession() {
    const workspace = selectedWorkspace ?? workspaces[0];
    if (!workspace || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/studio/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: workspace.id, title: 'New Studio Session' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error ?? 'Failed to create session.');
        return;
      }
      setSelectedSessionId(data.session.id);
      await loadContext();
    } finally {
      setBusy(false);
    }
  }

  async function confirmPlan() {
    if (!pendingPlan?.confirmToken || !selectedSession || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/studio/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true, confirmToken: pendingPlan.confirmToken, sessionId: selectedSession.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error ?? 'Execution failed.');
        return;
      }
      setPendingPlan(null);
      await loadContext();
    } catch {
      setNotice('Execution failed. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function runWorkflow(workflowId: string) {
    if (!workflowId || workflowBusy) return;
    setWorkflowBusy(true);
    setNotice('');
    try {
      const res = await fetch('/api/agent/workflows/run-due', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId, force: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error ?? 'Failed to run workflow.');
        return;
      }
      const ran = typeof data.ran === 'number' ? data.ran : 0;
      setNotice(ran > 0 ? `Workflow run started (${ran} execution${ran === 1 ? '' : 's'}).` : 'No runnable workflow step found.');
      await loadContext();
      if (selectedSession?.id) await loadBundle(selectedSession.id);
    } catch {
      setNotice('Workflow run failed. Check your connection and try again.');
    } finally {
      setWorkflowBusy(false);
    }
  }

  function updateVisualNode(id: string, patch: Partial<VisualNode>) {
    setVisualNodes(prev => prev.map(node => (node.id === id ? { ...node, ...patch } : node)));
  }

  function moveVisualNode(id: string, direction: 'up' | 'down') {
    setVisualNodes(prev => {
      const index = prev.findIndex(node => node.id === id);
      if (index < 0) return prev;
      const nextIndex = direction === 'up' ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  }

  function addVisualNode() {
    const id = `step-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    setVisualNodes(prev => [
      ...prev,
      {
        id,
        label: `Step ${prev.length + 1}`,
        tool: 'agentos.mem_get',
        description: `Step ${prev.length + 1}`,
        inputText: '{}',
      },
    ]);
  }

  function removeVisualNode(id: string) {
    setVisualNodes(prev => prev.filter(node => node.id !== id));
    setVisualEdges(prev => prev.filter(edge => edge.source !== id && edge.target !== id));
  }

  function addVisualEdge() {
    if (visualNodes.length < 2) return;
    setVisualEdges(prev => [
      ...prev,
      {
        id: `edge-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        source: visualNodes[0].id,
        target: visualNodes[1].id,
        condition: '',
      },
    ]);
  }

  function updateVisualEdge(id: string, patch: Partial<VisualEdge>) {
    setVisualEdges(prev => prev.map(edge => (edge.id === id ? { ...edge, ...patch } : edge)));
  }

  function removeVisualEdge(id: string) {
    setVisualEdges(prev => prev.filter(edge => edge.id !== id));
  }

  async function saveWorkflowMode(mode: WorkflowMode) {
    if (!selectedWorkflow?.id || workflowBusy) return;
    setWorkflowBusy(true);
    setNotice('');
    try {
      let payload: Record<string, unknown>;
      if (mode === 'conversation') {
        payload = { mode, steps: JSON.parse(workflowStepsDraft) };
      } else if (mode === 'visual') {
        if (visualNodes.length === 0) {
          setNotice('Add at least one visual node before saving.');
          return;
        }
        const nodes = visualNodes.map((node, index) => ({
          id: node.id,
          type: 'step',
          label: node.label.trim() || `Step ${index + 1}`,
          tool: normalizeTool(node.tool),
          description: node.description.trim() || node.label.trim() || `Step ${index + 1}`,
          input: JSON.parse(node.inputText || '{}'),
          order: index + 1,
          position: { x: 120 + (index * 220), y: 120 },
        }));
        const nodeIds = new Set(nodes.map(node => node.id));
        const edges = visualEdges
          .filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target) && edge.source !== edge.target)
          .map((edge, index) => ({
            id: edge.id || `edge-${index + 1}`,
            source: edge.source,
            target: edge.target,
            condition: edge.condition.trim() || null,
          }));
        payload = { mode, graph: { nodes, edges } };
      } else {
        payload = { mode, code: workflowCodeDraft };
      }

      const res = await fetch(`/api/agent/workflows/${selectedWorkflow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error ?? 'Workflow update failed.');
        return;
      }
      setNotice(`Workflow updated from ${mode} mode.`);
      await loadContext();
    } catch {
      setNotice(`Invalid ${mode} payload. Use valid JSON for conversation node inputs and code mode.`);
    } finally {
      setWorkflowBusy(false);
    }
  }

  async function createSubagent() {
    if (!selectedWorkspace || !subagentDraft.name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/subagents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: selectedWorkspace.id, ...subagentDraft }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error ?? 'Failed to create subagent.');
        return;
      }
      setSubagentDraft({ name: '', description: '', instructions: '' });
      await loadContext();
    } finally {
      setBusy(false);
    }
  }

  async function saveSecret() {
    if (!secretDraft.name.trim() || !secretDraft.value || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: selectedWorkspace?.id, name: secretDraft.name, value: secretDraft.value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error ?? 'Failed to save secret.');
        return;
      }
      setSecretDraft({ name: '', value: '' });
      setNotice('Secret saved. Plaintext was not returned.');
      await loadContext();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }} />;
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)' }}>
      <Nav activePath="/studio" />
      <div className="studio-shell">
        <aside className="studio-sidebar">
          <div className="studio-section-title">Workspace</div>
          <div className="studio-workspace">
            <div className="font-mono text-sm">{selectedWorkspace?.name ?? 'AgentOS Workspace'}</div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{session?.planLabel ?? 'Retail Free'} - free for now</div>
          </div>

          <div className="studio-section-title">Sessions</div>
          <button type="button" className="studio-new-session" onClick={() => void createSession()} disabled={busy || workspaces.length === 0}>+ New session</button>
          <div className="studio-list">
            {sessions.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSelectedSessionId(item.id);
                  void loadBundle(item.id);
                }}
                className="studio-session-button"
                style={item.id === selectedSession?.id ? { borderColor: 'var(--accent)', color: 'var(--text-primary)' } : {}}
              >
                <span>{item.title}</span>
                <small>{timeLabel(item.updatedAt)}</small>
              </button>
            ))}
          </div>

          <div className="studio-section-title">Projects</div>
          <div className="studio-mini-list">
            {workflows.slice(0, 5).map(workflow => <span key={workflow.id}>{workflow.name}</span>)}
            {workflows.length === 0 && <span>No workflows yet</span>}
          </div>
        </aside>

        <main className="studio-main">
          <div className="studio-header">
            <div>
              <div className="studio-eyebrow">NL Studio Terminal</div>
              <h1>{selectedSession?.title ?? 'AgentOS Studio'}</h1>
            </div>
            <div className="studio-status">
              <span>Super AgentOS</span>
              <strong>active</strong>
            </div>
          </div>

          <div className="studio-transcript">
            {messages.length === 0 && (
              <div className="studio-empty">
                <h2>Start with Super AgentOS</h2>
                <p>Ask for a workflow, a private research subagent, a skill install, a vault action, or a run. Studio will persist the conversation and backend events.</p>
              </div>
            )}
            {messages.map(message => (
              <div key={message.id} className={`studio-message ${message.role}`}>
                <div className="studio-message-meta">{message.role} · {timeLabel(message.createdAt)}</div>
                <div className="studio-message-body">{message.content}</div>
              </div>
            ))}
            {pendingPlan && (
              <div className={`studio-plan ${pendingPlan.blocked ? 'blocked' : ''}`}>
                <div className="studio-message-meta">{pendingPlan.blocked ? 'gated response' : 'plan preview'}</div>
                <p>{pendingPlan.summary}</p>
                {pendingPlan.steps.length > 0 && (
                  <div className="studio-plan-steps">
                    {pendingPlan.steps.map(step => (
                      <div key={step.order}>
                        <code>{step.tool.replace(/^agentos\./, '')}</code>
                        <span>{step.description}</span>
                      </div>
                    ))}
                  </div>
                )}
                {pendingPlan.confirmToken && (
                  <button type="button" className="btn-primary" onClick={() => void confirmPlan()} disabled={busy}>
                    {busy ? 'Running...' : 'Confirm and run'}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="studio-events">
            {events.slice(-8).map(event => {
              const tone = eventTone(event.type);
              return (
                <span key={event.id} style={{ background: tone.bg, color: tone.color, borderColor: tone.border }}>
                  {event.type}
                </span>
              );
            })}
          </div>

          {notice && <div className="studio-notice">{notice}</div>}

          <div className="studio-input">
            <textarea
              value={prompt}
              onChange={event => setPrompt(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void sendPrompt();
                }
              }}
              placeholder='Create a workflow that researches tokens on Base and summarizes risk.'
              rows={3}
            />
            <div className="studio-input-actions">
              <button type="button" onClick={() => setPrompt('Create a private research subagent.')}>Subagent</button>
              <button type="button" onClick={() => setPrompt('Install a market data skill.')}>Skill</button>
              <button type="button" onClick={() => setPanel('vault')}>Vault</button>
              <button type="button" className="btn-primary" onClick={() => void sendPrompt()} disabled={busy || !prompt.trim()}>
                {busy ? 'Working...' : 'Send'}
              </button>
            </div>
          </div>
        </main>

        <aside className="studio-panel">
          <div className="studio-panel-tabs">
            {visiblePanels.map(item => (
              <button key={item} type="button" onClick={() => setPanel(item)} className={panel === item ? 'active' : ''}>
                {item}
              </button>
            ))}
          </div>

                    {panel === 'workflow' && (
            <div className="studio-panel-body">
              <h2>Workflow Authoring</h2>
              {workflows.length > 0 && (
                <div className="studio-form" style={{ marginBottom: '10px' }}>
                  <select
                    value={selectedWorkflow?.id ?? ''}
                    onChange={event => setSelectedWorkflowId(event.target.value)}
                    className="input-dark"
                  >
                    {workflows.map(workflow => (
                      <option key={workflow.id} value={workflow.id}>
                        {workflow.name}
                      </option>
                    ))}
                  </select>
                  <div className="studio-input-actions" style={{ justifyContent: 'flex-start' }}>
                    <button type="button" onClick={() => setWorkflowMode('conversation')} style={workflowMode === 'conversation' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}>
                      Conversation
                    </button>
                    <button type="button" onClick={() => setWorkflowMode('visual')} style={workflowMode === 'visual' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}>
                      Visual
                    </button>
                    <button type="button" onClick={() => setWorkflowMode('code')} style={workflowMode === 'code' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}>
                      Code
                    </button>
                  </div>
                  {workflowMode === 'conversation' && (
                    <textarea
                      rows={8}
                      className="input-dark"
                      value={workflowStepsDraft}
                      onChange={event => setWorkflowStepsDraft(event.target.value)}
                      placeholder='[{"order":1,"tool":"agentos.net_http_get","description":"Fetch","input":{"url":"https://example.com"}}]'
                    />
                  )}
                  {workflowMode === 'visual' && (
                    <div className="visual-editor">
                      <div className="visual-toolbar">
                        <button type="button" onClick={() => addVisualNode()}>+ Node</button>
                        <button type="button" onClick={() => setVisualEdges(createSequentialEdges(visualNodes))} disabled={visualNodes.length < 2}>
                          Auto-connect
                        </button>
                        <button type="button" onClick={() => addVisualEdge()} disabled={visualNodes.length < 2}>
                          + Edge
                        </button>
                      </div>

                      <div className="visual-canvas">
                        {visualNodes.map((node, index) => (
                          <div key={node.id} className="visual-node-card">
                            <div className="visual-node-head">
                              <strong>{node.label || `Step ${index + 1}`}</strong>
                            <div className="visual-node-actions">
                                <button type="button" onClick={() => moveVisualNode(node.id, 'up')} disabled={index === 0}>up</button>
                                <button type="button" onClick={() => moveVisualNode(node.id, 'down')} disabled={index === visualNodes.length - 1}>down</button>
                                <button type="button" onClick={() => removeVisualNode(node.id)}>x</button>
                              </div>
                            </div>
                            <input
                              value={node.label}
                              onChange={event => updateVisualNode(node.id, { label: event.target.value })}
                              placeholder="Label"
                            />
                            <input
                              value={node.tool}
                              onChange={event => updateVisualNode(node.id, { tool: event.target.value })}
                              placeholder="agentos.net_http_get"
                            />
                            <input
                              value={node.description}
                              onChange={event => updateVisualNode(node.id, { description: event.target.value })}
                              placeholder="Description"
                            />
                            <textarea
                              rows={3}
                              value={node.inputText}
                              onChange={event => updateVisualNode(node.id, { inputText: event.target.value })}
                              placeholder='{"url":"https://example.com"}'
                            />
                          </div>
                        ))}
                        {visualNodes.length === 0 && (
                          <div className="visual-empty">Add nodes to build a workflow graph.</div>
                        )}
                      </div>

                      <div className="visual-edges">
                        <div className="studio-section-title" style={{ margin: '8px 0' }}>Edges</div>
                        {visualEdges.map(edge => (
                          <div key={edge.id} className="visual-edge-row">
                            <select value={edge.source} onChange={event => updateVisualEdge(edge.id, { source: event.target.value })}>
                              {visualNodes.map(node => <option key={`${edge.id}-src-${node.id}`} value={node.id}>{node.label || node.id}</option>)}
                            </select>
                            <span>{'->'}</span>
                            <select value={edge.target} onChange={event => updateVisualEdge(edge.id, { target: event.target.value })}>
                              {visualNodes.map(node => <option key={`${edge.id}-tgt-${node.id}`} value={node.id}>{node.label || node.id}</option>)}
                            </select>
                            <input
                              value={edge.condition}
                              onChange={event => updateVisualEdge(edge.id, { condition: event.target.value })}
                              placeholder="condition (optional)"
                            />
                            <button type="button" onClick={() => removeVisualEdge(edge.id)}>x</button>
                          </div>
                        ))}
                        {visualEdges.length === 0 && <p>No edges yet.</p>}
                      </div>
                    </div>
                  )}
                  {workflowMode === 'code' && (
                    <textarea
                      rows={10}
                      className="input-dark"
                      value={workflowCodeDraft}
                      onChange={event => setWorkflowCodeDraft(event.target.value)}
                      placeholder='{"version":"1.0.0","steps":[...],"graph":{"nodes":[],"edges":[]}}'
                    />
                  )}
                  <div className="studio-input-actions" style={{ justifyContent: 'flex-start' }}>
                    <button type="button" className="btn-primary" disabled={workflowBusy || !selectedWorkflow} onClick={() => void saveWorkflowMode(workflowMode)}>
                      {workflowBusy ? 'Saving...' : 'Save'}
                    </button>
                    <button type="button" disabled={workflowBusy || !selectedWorkflow} onClick={() => selectedWorkflow && void runWorkflow(selectedWorkflow.id)}>
                      Run
                    </button>
                    {selectedWorkflow?.last_error && (
                      <button type="button" disabled={workflowBusy} onClick={() => selectedWorkflow && void runWorkflow(selectedWorkflow.id)}>
                        Retry
                      </button>
                    )}
                  </div>
                </div>
              )}
              {workflows.map(workflow => (
                <div
                  key={workflow.id}
                  className="studio-row"
                  style={workflow.id === selectedWorkflow?.id ? { borderColor: 'var(--accent)' } : {}}
                >
                  <strong>{workflow.name}</strong>
                  <span>{workflow.status}{workflow.schedule ? ` · ${workflow.schedule}` : ''}{typeof workflow.version === 'number' ? ` · v${workflow.version}` : ''}</span>
                  {workflow.last_error && <em>{workflow.last_error}</em>}
                </div>
              ))}
              {workflows.length === 0 && <p>No saved workflows yet.</p>}
            </div>
          )}

          {panel === 'code' && (
            <div className="studio-panel-body">
              <h2>Code View</h2>
              <JsonBlock value={selectedWorkflow?.canonical_doc ?? selectedSession?.state?.workflowCode ?? selectedSession?.state ?? {}} />
            </div>
          )}

          {panel === 'subagents' && (
            <div className="studio-panel-body">
              <h2>Subagents</h2>
              <div className="studio-form">
                <input value={subagentDraft.name} onChange={event => setSubagentDraft(prev => ({ ...prev, name: event.target.value }))} placeholder="Private research subagent" />
                <input value={subagentDraft.description} onChange={event => setSubagentDraft(prev => ({ ...prev, description: event.target.value }))} placeholder="Purpose" />
                <textarea value={subagentDraft.instructions} onChange={event => setSubagentDraft(prev => ({ ...prev, instructions: event.target.value }))} placeholder="Instructions" rows={3} />
                <button type="button" className="btn-primary" onClick={() => void createSubagent()} disabled={busy || !subagentDraft.name.trim()}>Create</button>
              </div>
              {subagents.map(item => (
                <div key={item.id} className="studio-row">
                  <strong>{item.name}</strong>
                  <span>{item.description ?? 'Private execution worker'}</span>
                </div>
              ))}
            </div>
          )}

          {panel === 'skills' && (
            <div className="studio-panel-body">
              <h2>Skills</h2>
              {installedSkills.map((item, index) => {
                const skill = (item.skill ?? item) as Record<string, unknown>;
                return (
                  <div key={String(item.id ?? index)} className="studio-row">
                    <strong>{String(skill.name ?? 'Installed skill')}</strong>
                    <span>{String(skill.category ?? 'Capability')}</span>
                  </div>
                );
              })}
              {installedSkills.length === 0 && <p>No installed skills yet.</p>}
            </div>
          )}

          {panel === 'vault' && (
            <div className="studio-panel-body">
              <h2>Secrets Vault</h2>
              <div className="studio-form">
                <input value={secretDraft.name} onChange={event => setSecretDraft(prev => ({ ...prev, name: event.target.value.toUpperCase() }))} placeholder="OPENAI_API_KEY" />
                <input value={secretDraft.value} onChange={event => setSecretDraft(prev => ({ ...prev, value: event.target.value }))} placeholder="Secret value" type="password" />
                <button type="button" className="btn-primary" onClick={() => void saveSecret()} disabled={busy || !secretDraft.name || !secretDraft.value}>Save secret</button>
              </div>
              {vaultSecrets.map(secret => (
                <div key={secret.id} className="studio-row">
                  <strong>{secret.name}</strong>
                  <span>{secret.maskedValue} · v{secret.version}</span>
                </div>
              ))}
              {vaultSecrets.length === 0 && <p>No secrets stored.</p>}
            </div>
          )}

          {(panel === 'artifacts' || panel === 'runs' || panel === 'versions') && (
            <div className="studio-panel-body">
              <h2>{panel}</h2>
              <JsonBlock value={panel === 'runs' ? workflows.map(item => ({ name: item.name, result: item.last_result, error: item.last_error })) : selectedSession?.state?.[panel] ?? []} />
            </div>
          )}

          {panel === 'app' && canUseDeveloperConsole && (
            <div className="studio-panel-body">
              <h2>App Metadata</h2>
              <p>Enterprise SDK-backed app creation is available through Developer Console and remains hidden from retail accounts.</p>
            </div>
          )}
        </aside>
      </div>

      <style>{`
        .studio-shell { display: grid; grid-template-columns: 260px minmax(0, 1fr) 360px; min-height: calc(100vh - 56px); border-top: 1px solid var(--border); }
        .studio-sidebar, .studio-panel { background: rgba(255,255,255,0.015); border-right: 1px solid var(--border); padding: 18px; overflow: auto; }
        .studio-panel { border-right: 0; border-left: 1px solid var(--border); }
        .studio-section-title, .studio-eyebrow { font: 700 10px var(--font-mono), monospace; letter-spacing: .08em; text-transform: uppercase; color: var(--text-tertiary); margin: 18px 0 8px; }
        .studio-workspace, .studio-row, .studio-plan { border: 1px solid var(--border); background: rgba(255,255,255,0.025); padding: 12px; }
        .studio-list, .studio-mini-list, .studio-panel-body, .studio-form { display: flex; flex-direction: column; gap: 8px; }
        .studio-mini-list span, .studio-row span, .studio-panel-body p { color: var(--text-secondary); font-size: 12px; line-height: 1.5; }
        .studio-row strong { display: block; color: var(--text-primary); font-size: 13px; margin-bottom: 4px; }
        .studio-row em { display: block; color: #fca5a5; font-size: 12px; margin-top: 4px; font-style: normal; }
        .studio-session-button, .studio-new-session { width: 100%; text-align: left; border: 1px solid var(--border); background: rgba(255,255,255,0.02); color: var(--text-secondary); padding: 10px; cursor: pointer; }
        .studio-session-button span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .studio-session-button small { color: var(--text-tertiary); font-size: 11px; }
        .studio-main { display: grid; grid-template-rows: auto minmax(0, 1fr) auto auto auto; min-width: 0; }
        .studio-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 22px; border-bottom: 1px solid var(--border); }
        .studio-header h1 { margin: 0; font-size: 18px; color: var(--text-primary); }
        .studio-status { display: flex; gap: 8px; align-items: center; color: var(--text-secondary); font-size: 12px; }
        .studio-status strong { color: #86efac; }
        .studio-transcript { padding: 22px; overflow: auto; display: flex; flex-direction: column; gap: 12px; }
        .studio-empty { max-width: 620px; color: var(--text-secondary); }
        .studio-empty h2 { color: var(--text-primary); margin: 0 0 8px; font-size: 18px; }
        .studio-message { max-width: 780px; border: 1px solid var(--border); padding: 12px 14px; background: rgba(255,255,255,0.025); }
        .studio-message.user { align-self: flex-end; background: rgba(0,255,136,0.05); border-color: rgba(0,255,136,0.22); }
        .studio-message-meta { color: var(--text-tertiary); font: 700 10px var(--font-mono), monospace; text-transform: uppercase; margin-bottom: 6px; }
        .studio-message-body { white-space: pre-wrap; color: var(--text-primary); font-size: 14px; line-height: 1.6; }
        .studio-plan { max-width: 780px; display: flex; flex-direction: column; gap: 10px; border-color: rgba(34,197,94,0.22); }
        .studio-plan.blocked { border-color: rgba(239,68,68,0.3); background: rgba(239,68,68,0.06); }
        .studio-plan p { margin: 0; color: var(--text-primary); font-size: 14px; line-height: 1.5; }
        .studio-plan-steps { display: flex; flex-direction: column; gap: 6px; }
        .studio-plan-steps div { display: grid; grid-template-columns: 140px minmax(0,1fr); gap: 10px; color: var(--text-secondary); font-size: 12px; }
        .studio-plan-steps code { color: var(--accent); overflow: hidden; text-overflow: ellipsis; }
        .studio-events { border-top: 1px solid var(--border); padding: 8px 22px; display: flex; gap: 6px; overflow-x: auto; }
        .studio-events span { border: 1px solid; padding: 4px 8px; font: 700 10px var(--font-mono), monospace; white-space: nowrap; }
        .studio-notice { margin: 8px 22px 0; border: 1px solid rgba(245,158,11,0.26); color: #fcd34d; background: rgba(245,158,11,0.08); padding: 10px 12px; font-size: 13px; }
        .studio-input { border-top: 1px solid var(--border); padding: 14px 22px 18px; display: flex; flex-direction: column; gap: 10px; }
        .studio-input textarea, .studio-form input, .studio-form textarea, .studio-form select { width: 100%; background: rgba(0,0,0,0.35); border: 1px solid var(--border); color: var(--text-primary); padding: 10px 12px; outline: none; resize: vertical; }
        .studio-input-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
        .studio-input-actions button, .studio-panel-tabs button { border: 1px solid var(--border); background: rgba(255,255,255,0.02); color: var(--text-secondary); padding: 8px 10px; cursor: pointer; font-size: 12px; }
        .studio-panel-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
        .studio-panel-tabs button.active { color: var(--accent); border-color: var(--accent); background: rgba(0,255,136,0.06); }
        .studio-panel-body h2 { margin: 0 0 10px; font-size: 15px; color: var(--text-primary); text-transform: capitalize; }
        .visual-editor { border: 1px solid var(--border); background: rgba(255,255,255,0.02); padding: 10px; display: flex; flex-direction: column; gap: 10px; }
        .visual-toolbar { display: flex; gap: 8px; flex-wrap: wrap; }
        .visual-toolbar button { border: 1px solid var(--border); background: rgba(255,255,255,0.02); color: var(--text-secondary); padding: 6px 8px; font-size: 12px; cursor: pointer; }
        .visual-canvas { display: flex; flex-direction: column; gap: 8px; }
        .visual-node-card { border: 1px solid var(--border); background: rgba(0,0,0,0.24); padding: 10px; display: flex; flex-direction: column; gap: 6px; }
        .visual-node-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .visual-node-head strong { color: var(--text-primary); font-size: 12px; }
        .visual-node-actions { display: flex; gap: 4px; }
        .visual-node-actions button { border: 1px solid var(--border); background: rgba(255,255,255,0.02); color: var(--text-secondary); padding: 2px 6px; font-size: 11px; cursor: pointer; }
        .visual-empty { border: 1px dashed var(--border); color: var(--text-tertiary); padding: 12px; font-size: 12px; }
        .visual-edges { display: flex; flex-direction: column; gap: 8px; }
        .visual-edge-row { display: grid; grid-template-columns: minmax(0,1fr) auto minmax(0,1fr) minmax(0,1fr) auto; gap: 6px; align-items: center; }
        .visual-edge-row span { color: var(--text-tertiary); font-size: 12px; text-align: center; }
        .visual-edge-row button { border: 1px solid var(--border); background: rgba(255,255,255,0.02); color: var(--text-secondary); padding: 5px 8px; font-size: 11px; cursor: pointer; }
        @media (max-width: 1100px) { .studio-shell { grid-template-columns: 220px minmax(0, 1fr); } .studio-panel { grid-column: 1 / -1; border-left: 0; border-top: 1px solid var(--border); } }
        @media (max-width: 720px) { .studio-shell { display: flex; flex-direction: column; } .studio-sidebar { max-height: 240px; border-right: 0; border-bottom: 1px solid var(--border); } .studio-header, .studio-input { padding-left: 14px; padding-right: 14px; } .studio-transcript { padding: 14px; } .studio-message, .studio-plan { max-width: 100%; } .studio-plan-steps div, .visual-edge-row { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}



