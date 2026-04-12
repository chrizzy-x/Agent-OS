'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import { STUDIO_COMMAND_DEFINITIONS } from '@/src/studio/catalog';
import {
  clampStudioTranscriptHistory,
  createStudioAdvancedSession,
  getStudioAdvancedSessionKey,
  getStudioDraftStorageKey,
  getStudioHistoryStorageKey,
  isStudioAdvancedSessionActive,
  parseStudioAdvancedSession,
  type StudioAdvancedSession,
  type StudioTranscriptEntry,
} from '@/src/studio/client-state';
import type { StudioCommandResponse } from '@/src/studio/types';

// ── Types ────────────────────────────────────────────────────────────────────

type StudioContextState = {
  toolCount: number;
  installedSkillCount: number;
};

type StudioMode = 'nl' | 'advanced';

type IntentStep = {
  order: number;
  tool: string;
  input: Record<string, unknown>;
  description: string;
};

type IntentPlan = {
  summary: string;
  steps: IntentStep[];
  schedule: string | null;
  missingParams: string[];
  confirmToken: string | null;
  requiresInput: boolean;
};

type IntentResult = {
  executed: boolean;
  results: unknown[];
  workflowId: string | null;
  schedule: string | null;
};

type Workflow = {
  id: string;
  name: string;
  summary: string | null;
  steps: IntentStep[];
  schedule: string | null;
  status: 'active' | 'paused';
  created_at: string;
};

type KernelEntry = {
  id: string;
  product: string;
  command_topic: string;
  status_topic: string;
  available_commands: string[];
  status: string;
  registered_at: string;
};

// ── Small helpers ─────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button type="button" onClick={handleCopy} className="btn-outline text-xs px-3 py-1.5 rounded-lg">
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function KindBadge({ kind }: { kind: StudioCommandResponse['kind'] }) {
  const cls =
    kind === 'result' ? 'badge badge-green' :
    kind === 'preview' ? 'badge badge-warning' :
    kind === 'error' ? 'badge badge-danger' :
    'badge badge-accent';
  return <span className={cls}>{kind}</span>;
}

function formatResult(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

// ── NL Mode ──────────────────────────────────────────────────────────────────

function NLModePanel({ agentId }: { agentId: string }) {
  const [instruction, setInstruction] = useState('');
  const [plan, setPlan] = useState<IntentPlan | null>(null);
  const [result, setResult] = useState<IntentResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  async function parsePlan() {
    const trimmed = instruction.trim();
    if (!trimmed) return;
    setParsing(true);
    setPlan(null);
    setResult(null);
    setError('');
    try {
      const res = await fetch('/api/studio/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: trimmed }),
      });
      const body = await res.json() as IntentPlan & { error?: string };
      if (!res.ok) { setError(body.error ?? 'Failed to parse intent'); return; }
      setPlan(body);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setParsing(false);
    }
  }

  async function confirmPlan() {
    if (!plan?.confirmToken) return;
    setConfirming(true);
    setError('');
    try {
      const res = await fetch('/api/studio/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true, confirmToken: plan.confirmToken }),
      });
      const body = await res.json() as IntentResult & { error?: string };
      if (!res.ok) { setError(body.error ?? 'Execution failed'); return; }
      setResult(body);
      setPlan(null);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setConfirming(false);
    }
  }

  function reset() {
    setPlan(null);
    setResult(null);
    setError('');
    setInstruction('');
  }

  return (
    <div className="space-y-5">
      {/* Input */}
      {!plan && !result && (
        <div className="space-y-3">
          <label className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            Describe what you want the agent to do
          </label>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void parsePlan(); } }}
            rows={5}
            className="input-dark text-sm"
            placeholder={'e.g. "Fetch the latest ETH price and save it to memory as eth_price"'}
            disabled={parsing}
          />
          <button
            type="button"
            onClick={() => void parsePlan()}
            disabled={parsing || !instruction.trim()}
            className="btn-primary px-5 py-2.5 rounded-lg"
          >
            {parsing ? 'Analysing...' : 'Generate plan'}
          </button>
        </div>
      )}

      {/* Plan preview */}
      {plan && !result && (
        <div className="space-y-4">
          <div className="rounded-xl p-4" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.28)' }}>
            <div className="text-sm font-semibold mb-1">Plan summary</div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{plan.summary}</p>
            {plan.schedule && (
              <div className="mt-2 text-xs" style={{ color: '#c084fc' }}>Recurring: {plan.schedule}</div>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Steps</div>
            {plan.steps.map(step => (
              <div key={step.order} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono" style={{ color: '#c084fc' }}>#{step.order}</span>
                  <code className="text-xs" style={{ color: '#86efac' }}>{step.tool}</code>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{step.description}</p>
              </div>
            ))}
          </div>

          {plan.missingParams.length > 0 && (
            <div className="rounded-xl p-4" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.28)' }}>
              <div className="text-xs font-semibold mb-2" style={{ color: '#fcd34d' }}>Missing parameters</div>
              <ul className="text-xs space-y-1" style={{ color: '#fde68a' }}>
                {plan.missingParams.map(p => <li key={p}>- {p}</li>)}
              </ul>
              <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Provide these in your instruction and regenerate the plan.</p>
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            {plan.confirmToken && (
              <button
                type="button"
                onClick={() => void confirmPlan()}
                disabled={confirming}
                className="btn-primary px-5 py-2.5 rounded-lg"
              >
                {confirming ? 'Executing...' : 'Confirm and execute'}
              </button>
            )}
            <button type="button" onClick={reset} className="btn-outline px-4 py-2 rounded-lg">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Success */}
      {result && (
        <div className="space-y-4">
          <div className="rounded-xl p-4" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.28)' }}>
            <div className="text-sm font-semibold mb-1" style={{ color: '#86efac' }}>Workflow executed</div>
            {result.workflowId && (
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Workflow ID: <code>{result.workflowId}</code></div>
            )}
            {result.schedule && (
              <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Schedule: {result.schedule}</div>
            )}
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Step results</div>
            <pre className="terminal p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all" style={{ color: '#94a3b8' }}>
              {formatResult(result.results)}
            </pre>
          </div>
          <button type="button" onClick={reset} className="btn-outline px-4 py-2 rounded-lg">
            New plan
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl p-3 text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.28)', color: '#fca5a5' }}>
          {error}
        </div>
      )}
    </div>
  );
}

// ── Workflow Library Panel ────────────────────────────────────────────────────

function WorkflowLibrary() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/agent/workflows');
      const body = await res.json() as { workflows: Workflow[] };
      setWorkflows(body.workflows ?? []);
    } catch { /* keep existing */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function toggleStatus(wf: Workflow) {
    const next = wf.status === 'active' ? 'paused' : 'active';
    await fetch(`/api/agent/workflows/${wf.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    void load();
  }

  async function deleteWorkflow(id: string) {
    await fetch(`/api/agent/workflows/${id}`, { method: 'DELETE' });
    setWorkflows(prev => prev.filter(w => w.id !== id));
  }

  if (loading) return <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading workflows...</p>;
  if (workflows.length === 0) return <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No saved workflows yet. Use Natural Language mode to create one.</p>;

  return (
    <div className="space-y-2">
      {workflows.map(wf => (
        <div key={wf.id} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="text-sm font-semibold truncate">{wf.name}</div>
            <span className={`text-xs font-mono ${wf.status === 'active' ? 'text-green-400' : 'text-yellow-400'}`}>
              {wf.status}
            </span>
          </div>
          {wf.summary && <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>{wf.summary}</p>}
          {wf.schedule && <div className="text-xs mb-2" style={{ color: '#c084fc' }}>Schedule: {wf.schedule}</div>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void toggleStatus(wf)}
              className="btn-outline text-xs px-2 py-1 rounded-lg"
            >
              {wf.status === 'active' ? 'Pause' : 'Resume'}
            </button>
            <button
              type="button"
              onClick={() => void deleteWorkflow(wf.id)}
              className="text-xs px-2 py-1 rounded-lg"
              style={{ color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Kernel Status Panel ───────────────────────────────────────────────────────

function KernelStatusPanel() {
  const [kernels, setKernels] = useState<KernelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dispatching, setDispatching] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/kernel/registry');
      const body = await res.json() as { kernels: KernelEntry[] };
      setKernels(body.kernels ?? []);
    } catch { /* keep existing */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    intervalRef.current = setInterval(() => void load(), 15_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [load]);

  async function dispatch(product: string, command: string) {
    const key = `${product}:${command}`;
    setDispatching(key);
    try {
      await fetch('/api/kernel/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product, command }),
      });
    } catch { /* ignore */ }
    finally { setDispatching(null); }
  }

  if (loading) return <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading connected products...</p>;
  if (kernels.length === 0) return <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No SDK products registered. Call <code>POST /api/kernel/register</code> from your product to connect.</p>;

  return (
    <div className="space-y-2">
      {kernels.map(k => {
        const isOnline = k.status === 'online';
        return (
          <div key={k.id} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-2">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: isOnline ? '#22c55e' : '#ef4444', boxShadow: isOnline ? '0 0 6px #22c55e' : 'none' }}
              />
              <span className="text-sm font-semibold">{k.product}</span>
              <span className="text-xs ml-auto" style={{ color: 'var(--text-dim)' }}>{isOnline ? 'online' : 'offline'}</span>
            </div>
            {k.available_commands?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {k.available_commands.map(cmd => (
                  <button
                    key={cmd}
                    type="button"
                    disabled={dispatching === `${k.product}:${cmd}`}
                    onClick={() => void dispatch(k.product, cmd)}
                    className="btn-outline text-xs px-2 py-1 rounded-lg"
                    style={{ fontFamily: 'monospace' }}
                  >
                    {dispatching === `${k.product}:${cmd}` ? '...' : cmd}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function StudioPage() {
  const router = useRouter();
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [command, setCommand] = useState('help');
  const [history, setHistory] = useState<StudioTranscriptEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [context, setContext] = useState<StudioContextState>({ toolCount: 0, installedSkillCount: 0 });
  const [advancedSession, setAdvancedSession] = useState<StudioAdvancedSession | null>(null);
  const [showAdvancedModal, setShowAdvancedModal] = useState(false);
  const [sessionNotice, setSessionNotice] = useState('');
  const [mode, setMode] = useState<StudioMode>('nl');

  const agentId = session?.agentId ?? '';
  const advancedEnabled = isStudioAdvancedSessionActive(advancedSession);

  useEffect(() => {
    let active = true;
    void fetchBrowserSession().then(currentSession => {
      if (!active) return;
      if (!currentSession) { router.replace('/signin'); return; }
      setSession(currentSession);
      setLoading(false);
    });
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    if (!agentId) return;
    const storedHistory = localStorage.getItem(getStudioHistoryStorageKey(agentId));
    if (storedHistory) {
      try {
        const parsed = JSON.parse(storedHistory) as StudioTranscriptEntry[];
        setHistory(parsed);
        setSelectedId(parsed.at(-1)?.id ?? null);
      } catch { localStorage.removeItem(getStudioHistoryStorageKey(agentId)); }
    }
    const storedDraft = localStorage.getItem(getStudioDraftStorageKey(agentId));
    if (storedDraft) setCommand(storedDraft);
    const storedSession = parseStudioAdvancedSession(sessionStorage.getItem(getStudioAdvancedSessionKey(agentId)));
    if (isStudioAdvancedSessionActive(storedSession)) {
      setAdvancedSession(storedSession);
    } else {
      sessionStorage.removeItem(getStudioAdvancedSessionKey(agentId));
    }
  }, [agentId]);

  useEffect(() => {
    if (!agentId) return;
    localStorage.setItem(getStudioDraftStorageKey(agentId), command);
  }, [agentId, command]);

  useEffect(() => {
    if (!agentId) return;
    localStorage.setItem(getStudioHistoryStorageKey(agentId), JSON.stringify(clampStudioTranscriptHistory(history)));
  }, [agentId, history]);

  useEffect(() => {
    if (!agentId) return;
    const timer = window.setInterval(() => {
      const storedSession = parseStudioAdvancedSession(sessionStorage.getItem(getStudioAdvancedSessionKey(agentId)));
      if (!isStudioAdvancedSessionActive(storedSession)) {
        sessionStorage.removeItem(getStudioAdvancedSessionKey(agentId));
        setAdvancedSession(null);
      } else {
        setAdvancedSession(storedSession);
      }
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [agentId]);

  useEffect(() => {
    if (!agentId) return;
    void loadContext();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  const selectedEntry = useMemo(() => history.find(entry => entry.id === selectedId) ?? history.at(-1) ?? null, [history, selectedId]);

  async function loadContext() {
    try {
      const [skillsRes, toolsRes] = await Promise.all([
        fetch('/api/skills/installed'),
        fetch('/tools'),
      ]);
      const skillsBody = await skillsRes.json();
      const toolsBody = await toolsRes.json();
      setContext({
        installedSkillCount: Array.isArray(skillsBody.installed_skills) ? skillsBody.installed_skills.length : 0,
        toolCount: Array.isArray(toolsBody.tools) ? toolsBody.tools.length : 0,
      });
    } catch { /* keep existing */ }
  }

  function appendHistory(commandText: string, response: StudioCommandResponse) {
    const nextEntry: StudioTranscriptEntry = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      command: commandText,
      response,
    };
    setHistory(previous => {
      const next = clampStudioTranscriptHistory([...previous, nextEntry]);
      setSelectedId(nextEntry.id);
      return next;
    });
  }

  async function runCommand(commandText = command, confirmToken?: string) {
    const trimmed = commandText.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('advanced run ') && !advancedEnabled && !confirmToken) {
      setShowAdvancedModal(true);
      return;
    }
    setSubmitting(true);
    setSessionNotice('');
    try {
      const response = await fetch('/api/studio/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: trimmed, confirmToken, advancedMode: advancedEnabled }),
      });
      const body = await response.json() as StudioCommandResponse;
      appendHistory(trimmed, body);
      if (body.kind === 'result' || body.kind === 'help') await loadContext();
    } catch {
      appendHistory(trimmed, { kind: 'error', command: trimmed, mutating: false, summary: 'Studio request failed. Check your connection and try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  function enableAdvancedMode() {
    if (!agentId) return;
    const sessionState = createStudioAdvancedSession();
    sessionStorage.setItem(getStudioAdvancedSessionKey(agentId), JSON.stringify(sessionState));
    setAdvancedSession(sessionState);
    setShowAdvancedModal(false);
    setSessionNotice('Advanced mode is enabled for this browser session for 15 minutes.');
  }

  function disableAdvancedMode() {
    if (!agentId) return;
    sessionStorage.removeItem(getStudioAdvancedSessionKey(agentId));
    setAdvancedSession(null);
    setSessionNotice('Advanced mode has been turned off for this browser session.');
  }

  async function confirmPreview(entry: StudioTranscriptEntry) {
    if (!entry.response.confirmToken) return;
    await runCommand(entry.command, entry.response.confirmToken);
  }

  if (loading || !session) {
    return <div className="min-h-screen" style={{ background: 'var(--bg)' }} />;
  }

  return (
    <div className="min-h-screen bg-grid" style={{ background: 'var(--bg)' }}>
      {/* Nav */}
      <nav className="sticky top-0 z-50" style={{ background: 'rgba(3,3,10,0.92)', borderBottom: '1px solid var(--border)', backdropFilter: 'blur(16px)' }}>
        <div className="max-w-7xl mx-auto px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="font-mono font-bold text-sm">Agent<span style={{ color: 'var(--accent)' }}>OS</span></Link>
            <span className="badge badge-accent">Studio</span>
            <span className="text-xs font-mono hidden sm:block" style={{ color: 'var(--text-dim)' }}>v5 Ares</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Mode toggle */}
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <button
                type="button"
                onClick={() => setMode('nl')}
                className="px-2.5 py-1.5 text-xs font-medium transition-colors"
                style={mode === 'nl' ? { background: 'rgba(139,92,246,0.25)', color: '#c084fc' } : { color: 'var(--text-muted)' }}
              >
                <span className="sm:hidden">NL</span>
                <span className="hidden sm:inline">Natural Language</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('advanced')}
                className="px-2.5 py-1.5 text-xs font-medium transition-colors"
                style={mode === 'advanced' ? { background: 'rgba(139,92,246,0.25)', color: '#c084fc' } : { color: 'var(--text-muted)' }}
              >
                <span className="sm:hidden">Adv</span>
                <span className="hidden sm:inline">Advanced</span>
              </button>
            </div>
            <span className="font-mono text-xs hidden sm:block" style={{ color: 'var(--text-dim)' }}>{agentId}</span>
            <Link href="/dashboard" className="btn-outline text-xs px-3 py-1.5 rounded-lg">Dashboard</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-5 py-8 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.9fr)]">

        {/* ── Left column: mode-dependent main panel ── */}
        <div className="space-y-6">
          {mode === 'nl' ? (
            <section className="card p-6">
              <div className="mb-5">
                <div className="badge badge-accent mb-2">Natural Language</div>
                <h2 className="text-xl font-black">Describe your workflow</h2>
                <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                  Tell the agent what you want to accomplish. It will plan the steps, show you a preview, then execute on confirm.
                </p>
              </div>
              <NLModePanel agentId={agentId} />
            </section>
          ) : (
            <section className="card overflow-hidden">
              <div className="terminal-header justify-between">
                <div className="flex items-center gap-2">
                  <div className="terminal-dot" style={{ background: '#ef4444' }} />
                  <div className="terminal-dot" style={{ background: '#f59e0b' }} />
                  <div className="terminal-dot" style={{ background: '#22c55e' }} />
                  <span className="ml-3 text-xs" style={{ color: 'var(--text-dim)' }}>studio.agentos</span>
                </div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Ctrl+Enter to run</div>
              </div>

              <div className="p-4 space-y-4">
                <div className="terminal min-h-[440px] max-h-[440px] overflow-y-auto">
                  <div className="p-4 space-y-4">
                    {history.length === 0 && (
                      <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        Run <code>help</code> to see the guided Studio commands.
                      </div>
                    )}
                    {history.map(entry => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => setSelectedId(entry.id)}
                        className="w-full text-left rounded-xl p-3 transition-all"
                        style={selectedEntry?.id === entry.id
                          ? { background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.28)' }
                          : { background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}
                      >
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <code className="text-xs break-all" style={{ color: '#c084fc' }}>{entry.command}</code>
                          <KindBadge kind={entry.response.kind} />
                        </div>
                        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>{entry.response.summary}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <textarea
                    value={command}
                    onChange={(event) => setCommand(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                        event.preventDefault();
                        void runCommand();
                      }
                    }}
                    rows={5}
                    className="input-dark font-mono text-xs"
                    placeholder="help"
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <button type="button" onClick={() => void runCommand()} disabled={submitting} className="btn-primary px-4 py-2 rounded-lg">
                      {submitting ? 'Running...' : 'Run command'}
                    </button>
                    <button type="button" onClick={() => setCommand('help')} className="btn-outline px-4 py-2 rounded-lg">Reset</button>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Mutating commands show a preview before executing.</div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Workflow library (always visible) */}
          <section className="card p-5 space-y-4">
            <div>
              <div className="text-sm font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Saved</div>
              <div className="text-lg font-black mt-1">Workflow library</div>
            </div>
            <WorkflowLibrary />
          </section>
        </div>

        {/* ── Right column ── */}
        <div className="space-y-6">

          {/* Execution panel (advanced mode only) */}
          {mode === 'advanced' && (
            <section className="card p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Preview / Result</div>
                  <div className="text-lg font-black mt-1">Execution panel</div>
                </div>
                {selectedEntry && <KindBadge kind={selectedEntry.response.kind} />}
              </div>

              {!selectedEntry && (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Select a command from the transcript or run a new one to inspect its preview and result.
                </p>
              )}

              {selectedEntry && (
                <div className="space-y-4">
                  <div>
                    <div className="text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Command</div>
                    <div className="terminal p-3 text-xs break-all" style={{ color: '#c084fc' }}>{selectedEntry.command}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Summary</div>
                    <p className="text-sm">{selectedEntry.response.summary}</p>
                  </div>
                  {selectedEntry.response.preview && (
                    <div className="rounded-xl p-4" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.22)' }}>
                      <div className="text-sm font-semibold mb-2">{selectedEntry.response.preview.action}</div>
                      {selectedEntry.response.preview.target && (
                        <div className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Target: {selectedEntry.response.preview.target}</div>
                      )}
                      {selectedEntry.response.preview.payloadSummary && (
                        <pre className="terminal p-3 text-xs whitespace-pre-wrap break-all" style={{ color: '#fcd34d' }}>
                          {selectedEntry.response.preview.payloadSummary}
                        </pre>
                      )}
                      {selectedEntry.response.preview.risks && selectedEntry.response.preview.risks.length > 0 && (
                        <ul className="mt-3 text-xs space-y-1" style={{ color: '#fcd34d' }}>
                          {selectedEntry.response.preview.risks.map(risk => <li key={risk}>- {risk}</li>)}
                        </ul>
                      )}
                      {selectedEntry.response.confirmToken && (
                        <button type="button" onClick={() => void confirmPreview(selectedEntry)} disabled={submitting} className="btn-primary mt-4 px-4 py-2 rounded-lg">
                          {submitting ? 'Confirming...' : 'Confirm and execute'}
                        </button>
                      )}
                    </div>
                  )}
                  {selectedEntry.response.result !== undefined && (
                    <div>
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <div className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Result</div>
                        <CopyButton text={formatResult(selectedEntry.response.result)} />
                      </div>
                      <pre className="terminal p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all" style={{ color: '#94a3b8' }}>
                        {formatResult(selectedEntry.response.result)}
                      </pre>
                    </div>
                  )}
                  {selectedEntry.response.snippet && (
                    <div>
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <div className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Snippet</div>
                        <CopyButton text={selectedEntry.response.snippet} />
                      </div>
                      <pre className="terminal p-3 text-xs overflow-x-auto whitespace-pre-wrap" style={{ color: '#86efac' }}>
                        {selectedEntry.response.snippet}
                      </pre>
                    </div>
                  )}
                  {selectedEntry.response.warnings && selectedEntry.response.warnings.length > 0 && (
                    <div className="p-4" style={{ background: 'rgba(255,170,0,0.06)', border: '1px solid rgba(255,170,0,0.2)' }}>
                      <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--warning)' }}>Warnings</div>
                      <ul className="text-xs space-y-1" style={{ color: '#a5f3fc' }}>
                        {selectedEntry.response.warnings.map(warning => <li key={warning}>- {warning}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Agent workspace */}
          <section className="card p-5 space-y-4">
            <div>
              <div className="text-sm font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Context</div>
              <div className="text-lg font-black mt-1">Agent workspace</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl p-4 col-span-2" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.22)' }}>
                <div className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Agent ID</div>
                <div className="font-mono text-xs mt-2 break-all">{agentId}</div>
              </div>
              <div className="p-4" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}>
                <div className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Skills</div>
                <div className="text-2xl font-black mt-2">{context.installedSkillCount}</div>
              </div>
              <div className="rounded-xl p-4" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.22)' }}>
                <div className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Tools</div>
                <div className="text-2xl font-black mt-2">{context.toolCount}</div>
              </div>
            </div>

            {mode === 'advanced' && (
              <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="text-sm font-semibold">Advanced sandbox</div>
                  <button type="button" onClick={advancedEnabled ? disableAdvancedMode : () => setShowAdvancedModal(true)} className="btn-outline text-xs px-3 py-1.5 rounded-lg">
                    {advancedEnabled ? 'Disable' : 'Enable'}
                  </button>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Exposes <code>proc_execute</code> for 15 minutes in this browser session.
                </p>
                {sessionNotice && <div className="text-xs mt-2" style={{ color: '#67e8f9' }}>{sessionNotice}</div>}
              </div>
            )}

            {mode === 'advanced' && (
              <div>
                <div className="text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>Quick templates</div>
                <div className="space-y-2">
                  {STUDIO_COMMAND_DEFINITIONS.map(definition => (
                    <button
                      key={definition.command}
                      type="button"
                      onClick={() => setCommand(definition.command)}
                      className="w-full rounded-xl p-3 text-left transition-all"
                      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}
                    >
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <div className="text-sm font-semibold">{definition.title}</div>
                        {definition.requiresAdvancedMode
                          ? <span className="badge badge-amber">advanced</span>
                          : <span className={definition.mutating ? 'badge badge-warning' : 'badge badge-accent'}>{definition.mutating ? 'preview' : 'read-only'}</span>}
                      </div>
                      <code className="block text-xs mb-1" style={{ color: '#c084fc' }}>{definition.command}</code>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{definition.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Kernel status */}
          <section className="card p-5 space-y-4">
            <div>
              <div className="text-sm font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>SDK</div>
              <div className="text-lg font-black mt-1">Connected products</div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>Auto-refreshes every 15s</div>
            </div>
            <KernelStatusPanel />
          </section>
        </div>
      </div>

      {/* Advanced mode modal */}
      {showAdvancedModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-5" style={{ background: 'rgba(2,6,23,0.76)' }}>
          <div className="card max-w-xl w-full p-6 space-y-4">
            <div>
              <div className="badge badge-amber mb-3">Advanced sandbox mode</div>
              <h2 className="text-2xl font-black mb-2">Enable advanced execution?</h2>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                This exposes the sandboxed <code>proc_execute</code> path inside Studio for 15 minutes in this browser session. No raw host shell is exposed.
              </p>
            </div>
            <ul className="text-sm space-y-2" style={{ color: 'var(--text-muted)' }}>
              <li>- Code still runs with timeout and output limits.</li>
              <li>- Use this for deliberate debugging, not routine production workflows.</li>
            </ul>
            <div className="flex items-center justify-end gap-3">
              <button type="button" onClick={() => setShowAdvancedModal(false)} className="btn-outline px-4 py-2 rounded-lg">Cancel</button>
              <button type="button" onClick={enableAdvancedMode} className="btn-primary px-4 py-2 rounded-lg">I understand, enable it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
