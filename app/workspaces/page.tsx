'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchBrowserSession } from '@/src/auth/browser-session';

interface Workspace {
  id: string;
  name: string;
  slug: string;
  plan: string;
  createdAt: string;
}

interface WorkspaceAgent {
  agentName: string | null;
  addedAt: string;
}

interface AuditEntry {
  id: string;
  actorLabel: string | null;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Workspace | null>(null);
  const [agents, setAgents] = useState<WorkspaceAgent[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState('');
  const [agentNameInput, setAgentNameInput] = useState('');
  const [memberIdInput, setMemberIdInput] = useState('');
  const [memberRole, setMemberRole] = useState<'member' | 'admin' | 'viewer'>('member');
  const [agentBearerToken, setAgentBearerToken] = useState('');

  useEffect(() => {
    void (async () => {
      const session = await fetchBrowserSession();
      if (!session) return;
      try {
        const res = await fetch('/api/workspaces');
        const data = await res.json();
        setWorkspaces(data.workspaces ?? []);
      } catch { /* silent */ }
      finally { setLoading(false); }
    })();
  }, []);

  const loadDetail = async (ws: Workspace) => {
    setSelected(ws);
    setDetailLoading(true);
    try {
      const [agentsRes, auditRes] = await Promise.all([
        fetch(`/api/workspaces/${ws.id}/agents`),
        fetch(`/api/workspaces/${ws.id}/audit`),
      ]);
      const agentsData = await agentsRes.json();
      const auditData = await auditRes.json();
      setAgents(agentsData.agents ?? []);
      setAudit(auditData.audit ?? []);
    } catch { /* keep empty */ }
    finally { setDetailLoading(false); }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError('');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (agentBearerToken) headers['Authorization'] = `Bearer ${agentBearerToken}`;
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setCreateError(data.error ?? 'Failed to create workspace'); return; }
      setWorkspaces(prev => [data.workspace, ...prev]);
      setNewName('');
    } catch { setCreateError('Request failed'); }
    finally { setCreating(false); }
  };

  const handleAddAgent = async () => {
    if (!selected || !agentNameInput.trim()) return;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (agentBearerToken) headers['Authorization'] = `Bearer ${agentBearerToken}`;
    await fetch(`/api/workspaces/${selected.id}/agents`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ agent_name: agentNameInput.trim() }),
    });
    setAgentNameInput('');
    void loadDetail(selected);
  };

  const handleAddMember = async () => {
    if (!selected || !memberIdInput.trim()) return;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (agentBearerToken) headers['Authorization'] = `Bearer ${agentBearerToken}`;
    await fetch(`/api/workspaces/${selected.id}/members`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ user_id: memberIdInput.trim(), role: memberRole }),
    });
    setMemberIdInput('');
    void loadDetail(selected);
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <nav style={{ background: 'rgba(3,3,10,0.9)', borderBottom: '1px solid var(--border)', backdropFilter: 'blur(16px)' }}
        className="sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-7 h-7 flex items-center justify-center font-black font-mono text-xs"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--accent)', color: 'var(--accent)' }}>
                A
              </div>
              <span className="font-mono font-bold text-sm">Agent<span style={{ color: 'var(--accent)' }}>OS</span></span>
            </Link>
            <div className="hidden sm:flex items-center gap-5 text-sm" style={{ color: 'var(--text-muted)' }}>
              <Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
              <Link href="/marketplace" className="hover:text-white transition-colors">Skill Store</Link>
              <Link href="/appstore" className="hover:text-white transition-colors">App Store</Link>
              <Link href="/workspaces" className="transition-colors" style={{ color: 'var(--accent)' }}>Workspaces</Link>
            </div>
          </div>
          <Link href="/dashboard" className="btn-outline text-sm px-3 py-1.5 rounded-lg">← Dashboard</Link>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-5 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-black text-2xl">Workspaces</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              Group agents and members into shared collaboration spaces.
            </p>
          </div>
        </div>

        <div className="mb-4">
          <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Bearer Token (for API calls)</div>
          <input
            type="password"
            value={agentBearerToken}
            onChange={e => setAgentBearerToken(e.target.value)}
            placeholder="Paste your agent bearer token"
            className="input-dark w-full max-w-md text-sm"
          />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left: workspace list + create */}
          <div className="lg:col-span-1 space-y-4">
            <div className="card p-5">
              <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>New Workspace</div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void handleCreate(); }}
                  placeholder="Workspace name"
                  className="input-dark flex-1 text-sm"
                />
                <button onClick={() => void handleCreate()} disabled={creating || !newName.trim()} className="btn-primary text-sm px-4 py-2 rounded-lg flex-shrink-0">
                  {creating ? '…' : 'Create'}
                </button>
              </div>
              {createError && <p className="text-xs mt-2" style={{ color: '#fca5a5' }}>{createError}</p>}
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Your Workspaces</div>
              {loading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => <div key={i} className="card h-16 animate-pulse" />)}
                </div>
              ) : workspaces.length === 0 ? (
                <div className="card p-8 text-center">
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No workspaces yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {workspaces.map(ws => (
                    <button key={ws.id} onClick={() => void loadDetail(ws)}
                      className="card w-full p-4 text-left transition-all"
                      style={selected?.id === ws.id ? { borderColor: 'var(--accent)' } : {}}>
                      <div className="font-semibold text-sm">{ws.name}</div>
                      <div className="font-mono text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {ws.slug} · {ws.plan}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: detail panel */}
          <div className="lg:col-span-2">
            {!selected ? (
              <div className="card p-16 text-center h-full flex flex-col items-center justify-center">
                <p className="font-bold mb-2">Select a workspace</p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Click a workspace on the left to view its agents, members, and audit log.</p>
              </div>
            ) : detailLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => <div key={i} className="card h-24 animate-pulse" />)}
              </div>
            ) : (
              <div className="space-y-5">
                <div className="card p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-black text-lg">{selected.name}</h2>
                    <span className="text-xs px-2 py-0.5 rounded font-medium"
                      style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
                      {selected.plan}
                    </span>
                  </div>
                  <div className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>Slug: {selected.slug}</div>
                </div>

                <div className="card p-5">
                  <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>Agents ({agents.length})</div>
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      value={agentNameInput}
                      onChange={e => setAgentNameInput(e.target.value)}
                      placeholder="Agent name"
                      className="input-dark flex-1 text-sm"
                    />
                    <button onClick={() => void handleAddAgent()} className="btn-outline text-sm px-3 py-2 rounded-lg flex-shrink-0">Add</button>
                  </div>
                  {agents.length === 0 ? (
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No agents in this workspace.</p>
                  ) : (
                    <div className="space-y-2">
                      {agents.map(a => (
                        <div key={`${a.agentName ?? 'agent'}-${a.addedAt}`} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)' }}>
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--accent)' }} />
                          <span className="text-sm flex-1">{a.agentName ?? 'Private agent'}</span>
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{new Date(a.addedAt).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="card p-5">
                  <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>Invite Member</div>
                  <div className="flex gap-2 mb-1">
                    <input
                      type="text"
                      value={memberIdInput}
                      onChange={e => setMemberIdInput(e.target.value)}
                      placeholder="Account email or team handle"
                      className="input-dark flex-1 text-sm"
                    />
                    <select
                      value={memberRole}
                      onChange={e => setMemberRole(e.target.value as 'member' | 'admin' | 'viewer')}
                      className="input-dark text-sm"
                      style={{ width: 'auto' }}
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button onClick={() => void handleAddMember()} className="btn-outline text-sm px-3 py-2 rounded-lg flex-shrink-0">Invite</button>
                  </div>
                </div>

                <div className="card p-5">
                  <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>Audit Log</div>
                  {audit.length === 0 ? (
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No activity yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {audit.slice(0, 20).map(entry => (
                        <div key={entry.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)' }}>
                          <div className="flex-1">
                            <span className="font-mono text-xs font-semibold" style={{ color: 'var(--accent)' }}>{entry.action}</span>
                            {entry.actorLabel && <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>by {entry.actorLabel}</span>}
                          </div>
                          <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                            {new Date(entry.createdAt).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
