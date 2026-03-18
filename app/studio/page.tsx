'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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

type StudioContextState = {
  toolCount: number;
  installedSkillCount: number;
};

function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

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
  const className =
    kind === 'result' ? 'badge badge-green' :
    kind === 'preview' ? 'badge badge-amber' :
    kind === 'error' ? 'badge badge-cyan' :
    'badge badge-purple';

  return <span className={className}>{kind}</span>;
}

function formatResult(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export default function StudioPage() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState('');
  const [agentId, setAgentId] = useState('');
  const [command, setCommand] = useState('help');
  const [history, setHistory] = useState<StudioTranscriptEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [context, setContext] = useState<StudioContextState>({ toolCount: 0, installedSkillCount: 0 });
  const [advancedSession, setAdvancedSession] = useState<StudioAdvancedSession | null>(null);
  const [showAdvancedModal, setShowAdvancedModal] = useState(false);
  const [sessionNotice, setSessionNotice] = useState('');

  const advancedEnabled = isStudioAdvancedSessionActive(advancedSession);

  useEffect(() => {
    const storedKey = localStorage.getItem('apiKey') || '';
    if (!storedKey) {
      router.replace('/signin');
      return;
    }

    setApiKey(storedKey);
    const payload = decodeJwt(storedKey);
    const id = typeof payload?.sub === 'string' ? payload.sub : '';
    if (!id) {
      router.replace('/signin');
      return;
    }

    setAgentId(id);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    if (!agentId) return;

    const storedHistory = localStorage.getItem(getStudioHistoryStorageKey(agentId));
    if (storedHistory) {
      try {
        const parsed = JSON.parse(storedHistory) as StudioTranscriptEntry[];
        setHistory(parsed);
        setSelectedId(parsed.at(-1)?.id ?? null);
      } catch {
        localStorage.removeItem(getStudioHistoryStorageKey(agentId));
      }
    }

    const storedDraft = localStorage.getItem(getStudioDraftStorageKey(agentId));
    if (storedDraft) {
      setCommand(storedDraft);
    }

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
    if (!apiKey) return;
    void loadContext(apiKey);
  }, [apiKey]);

  const selectedEntry = useMemo(() => history.find(entry => entry.id === selectedId) ?? history.at(-1) ?? null, [history, selectedId]);

  async function loadContext(token = apiKey) {
    if (!token) return;

    try {
      const [skillsRes, toolsRes] = await Promise.all([
        fetch('/api/skills/installed', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/tools'),
      ]);

      const skillsBody = await skillsRes.json();
      const toolsBody = await toolsRes.json();

      setContext({
        installedSkillCount: Array.isArray(skillsBody.installed_skills) ? skillsBody.installed_skills.length : 0,
        toolCount: Array.isArray(toolsBody.tools) ? toolsBody.tools.length : 0,
      });
    } catch {
      // keep existing context values
    }
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
    if (!trimmed || !apiKey) return;

    if (trimmed.startsWith('advanced run ') && !advancedEnabled && !confirmToken) {
      setShowAdvancedModal(true);
      return;
    }

    setSubmitting(true);
    setSessionNotice('');

    try {
      const response = await fetch('/api/studio/command', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command: trimmed,
          confirmToken,
          advancedMode: advancedEnabled,
        }),
      });

      const body = await response.json() as StudioCommandResponse;
      appendHistory(trimmed, body);

      if (body.kind === 'result' || body.kind === 'help') {
        await loadContext(apiKey);
      }
    } catch {
      appendHistory(trimmed, {
        kind: 'error',
        command: trimmed,
        mutating: false,
        summary: 'Studio request failed. Check your connection and try again.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  function enableAdvancedMode() {
    if (!agentId) return;
    const session = createStudioAdvancedSession();
    sessionStorage.setItem(getStudioAdvancedSessionKey(agentId), JSON.stringify(session));
    setAdvancedSession(session);
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

  if (loading) {
    return <div className="min-h-screen" style={{ background: 'var(--bg)' }} />;
  }

  return (
    <div className="min-h-screen bg-grid" style={{ background: 'var(--bg)' }}>
      <nav className="sticky top-0 z-50" style={{ background: 'rgba(3,3,10,0.92)', borderBottom: '1px solid var(--border)', backdropFilter: 'blur(16px)' }}>
        <div className="max-w-7xl mx-auto px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="font-mono font-bold text-sm">Agent<span className="gradient-text">OS</span></Link>
            <span className="badge badge-purple">Studio Console</span>
          </div>
          <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span className="font-mono">{agentId}</span>
            <Link href="/dashboard" className="btn-outline text-xs px-3 py-1.5 rounded-lg">Back to Dashboard</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-5 py-8 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.9fr)]">
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
                <button type="button" onClick={() => setCommand('help')} className="btn-outline px-4 py-2 rounded-lg">Reset to help</button>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Mutating commands always stop at a preview before they execute.
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="space-y-6">
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
                Select a command from the transcript or run a new one to inspect its preview, result, warnings, and reusable snippet.
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
                      <div className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Reusable snippet</div>
                      <CopyButton text={selectedEntry.response.snippet} />
                    </div>
                    <pre className="terminal p-3 text-xs overflow-x-auto whitespace-pre-wrap" style={{ color: '#86efac' }}>
                      {selectedEntry.response.snippet}
                    </pre>
                  </div>
                )}

                {selectedEntry.response.warnings && selectedEntry.response.warnings.length > 0 && (
                  <div className="rounded-xl p-4" style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.22)' }}>
                    <div className="text-xs uppercase tracking-widest mb-2" style={{ color: '#67e8f9' }}>Warnings</div>
                    <ul className="text-xs space-y-1" style={{ color: '#a5f3fc' }}>
                      {selectedEntry.response.warnings.map(warning => <li key={warning}>- {warning}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="card p-5 space-y-4">
            <div>
              <div className="text-sm font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Context</div>
              <div className="text-lg font-black mt-1">Agent workspace</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl p-4" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.22)' }}>
                <div className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Agent</div>
                <div className="font-mono text-xs mt-2 break-all">{agentId}</div>
              </div>
              <div className="rounded-xl p-4" style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.22)' }}>
                <div className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Installed skills</div>
                <div className="text-2xl font-black mt-2">{context.installedSkillCount}</div>
              </div>
              <div className="rounded-xl p-4" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.22)' }}>
                <div className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Available tools</div>
                <div className="text-2xl font-black mt-2">{context.toolCount}</div>
              </div>
              <div className="rounded-xl p-4" style={{ background: advancedEnabled ? 'rgba(34,197,94,0.08)' : 'rgba(245,158,11,0.08)', border: advancedEnabled ? '1px solid rgba(34,197,94,0.22)' : '1px solid rgba(245,158,11,0.22)' }}>
                <div className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Advanced mode</div>
                <div className="text-sm font-semibold mt-2">{advancedEnabled ? 'Enabled' : 'Disabled'}</div>
              </div>
            </div>

            <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="text-sm font-semibold">Advanced sandbox lane</div>
                <button type="button" onClick={advancedEnabled ? disableAdvancedMode : () => setShowAdvancedModal(true)} className="btn-outline text-xs px-3 py-1.5 rounded-lg">
                  {advancedEnabled ? 'Disable' : 'Enable'}
                </button>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Advanced mode exposes <code>proc_execute</code> through Studio for 15 minutes in this browser session. It is not a raw shell and it does not add new backend privileges.
              </p>
              {sessionNotice && <div className="text-xs mt-2" style={{ color: '#67e8f9' }}>{sessionNotice}</div>}
            </div>

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
                      {definition.requiresAdvancedMode ? <span className="badge badge-amber">advanced</span> : <span className={definition.mutating ? 'badge badge-purple' : 'badge badge-green'}>{definition.mutating ? 'preview' : 'read-only'}</span>}
                    </div>
                    <code className="block text-xs mb-1" style={{ color: '#c084fc' }}>{definition.command}</code>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{definition.description}</p>
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>

      {showAdvancedModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-5" style={{ background: 'rgba(2,6,23,0.76)' }}>
          <div className="card max-w-xl w-full p-6 space-y-4">
            <div>
              <div className="badge badge-amber mb-3">Advanced sandbox mode</div>
              <h2 className="text-2xl font-black mb-2">Enable advanced execution?</h2>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                This exposes the sandboxed <code>proc_execute</code> path inside Studio for 15 minutes in this browser session. Network and filesystem behavior in sandboxed subprocesses is different from the guided <code>net_*</code> and <code>fs_*</code> primitives.
              </p>
            </div>
            <ul className="text-sm space-y-2" style={{ color: 'var(--text-muted)' }}>
              <li>- No raw host shell is exposed.</li>
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
