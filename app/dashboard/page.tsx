'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface InstalledSkill {
  id: string;
  installed_at: string;
  skill: {
    id: string;
    name: string;
    slug: string;
    icon: string;
    category: string;
    description: string;
    pricing_model: string;
    price_per_call: number;
    capabilities: { name: string; description: string }[];
    rating: number;
    verified: boolean;
  };
}

interface AuditEntry {
  primitive: string;
  operation: string;
  success: boolean;
  duration_ms: number;
  created_at: string;
  error?: string;
}

function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
    return JSON.parse(atob(padded));
  } catch { return null; }
}

const PRIM_COLORS: Record<string, string> = {
  fs: '#06b6d4', net: '#22c55e', proc: '#f59e0b',
  mem: '#a855f7', db: '#3b82f6', events: '#ec4899',
};

export default function DashboardPage() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState('');
  const [agentId, setAgentId] = useState('');
  const [installedSkills, setInstalledSkills] = useState<InstalledSkill[]>([]);
  const [recentAudit, setRecentAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'skills' | 'activity'>('overview');

  useEffect(() => {
    const key = localStorage.getItem('apiKey') || '';
    if (!key) { router.replace('/signin'); return; }
    setApiKey(key);
    const payload = decodeJwt(key);
    const id = (payload?.sub as string) || '';
    setAgentId(id);
    if (id) fetchInstalledSkills(key).finally(() => setLoading(false));
    else setLoading(false);
  }, [router]);

  const fetchInstalledSkills = async (key: string) => {
    try {
      const res = await fetch('/api/skills/installed', { headers: { Authorization: `Bearer ${key}` } });
      const data = await res.json();
      setInstalledSkills(data.installed_skills ?? []);
    } catch { /* silent */ }
  };

  const handleSignOut = () => {
    localStorage.removeItem('apiKey');
    localStorage.removeItem('agentId');
    router.push('/signin');
  };

  const uninstallSkill = async (skillId: string) => {
    if (!confirm('Uninstall this skill?')) return;
    try {
      await fetch('/api/skills/uninstall', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill_id: skillId }),
      });
      setInstalledSkills(s => s.filter(i => i.skill.id !== skillId));
    } catch { /* silent */ }
  };

  if (!apiKey) return null;

  const initials = agentId ? agentId.slice(6, 8).toUpperCase() : '??';

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Nav */}
      <nav style={{ background: 'rgba(3,3,10,0.9)', borderBottom: '1px solid var(--border)', backdropFilter: 'blur(16px)' }}
        className="sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center font-black font-mono text-xs"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', boxShadow: '0 0 10px rgba(124,58,237,0.4)' }}>
                A
              </div>
              <span className="font-mono font-bold text-sm">Agent<span className="gradient-text">OS</span></span>
            </Link>
            <div className="hidden sm:flex items-center gap-5 text-sm" style={{ color: 'var(--text-muted)' }}>
              <Link href="/marketplace" className="hover:text-white transition-colors">Marketplace</Link>
              <Link href="/developer" className="hover:text-white transition-colors">Developer</Link>
              <Link href="/docs" className="hover:text-white transition-colors">Docs</Link>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {agentId && (
              <span className="hidden sm:block font-mono text-xs px-2.5 py-1.5 rounded-lg"
                style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', color: '#a78bfa' }}>
                {agentId.slice(0, 22)}…
              </span>
            )}
            <button onClick={handleSignOut} className="btn-outline text-sm px-3 py-1.5 rounded-lg">
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-5 py-8">
        {/* Agent info bar */}
        <div className="card p-5 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-sm font-mono flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', boxShadow: '0 0 16px rgba(124,58,237,0.35)' }}>
              {initials}
            </div>
            <div>
              <div className="font-bold">My Agent</div>
              <div className="font-mono text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {agentId || 'Loading...'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-6 sm:gap-8">
            {[
              { val: installedSkills.length.toString(), label: 'Skills' },
              { val: '100', label: 'req/min' },
              { val: '1 GB', label: 'Storage' },
            ].map(s => (
              <div key={s.label} className="text-center">
                <div className="text-xl font-black gradient-text">{s.val}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 rounded-lg w-fit"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {(['overview', 'skills', 'activity'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className="px-4 py-2 text-sm font-medium rounded-md capitalize transition-all"
              style={activeTab === tab
                ? { background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: 'white', boxShadow: '0 0 16px rgba(124,58,237,0.3)' }
                : { color: 'var(--text-muted)' }}>
              {tab}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="card h-28 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* ── Overview ── */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Quick actions */}
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
                    Quick Actions
                  </h2>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      { href: '/marketplace', label: 'Browse Skills', icon: (
                        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
                        </svg>
                      ), color: '#a855f7' },
                      { href: '/developer', label: 'Publish Skill', icon: (
                        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
                        </svg>
                      ), color: '#06b6d4' },
                      { href: '/docs', label: 'Read Docs', icon: (
                        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                        </svg>
                      ), color: '#22c55e' },
                      { href: '/tools', label: 'Browse Tools', icon: (
                        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
                        </svg>
                      ), color: '#f59e0b' },
                    ].map(a => (
                      <Link key={a.href} href={a.href}
                        className="card p-5 flex flex-col items-start gap-3 group">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                          style={{ background: `${a.color}12`, border: `1px solid ${a.color}25`, color: a.color }}>
                          {a.icon}
                        </div>
                        <span className="text-sm font-medium group-hover:text-white transition-colors"
                          style={{ color: 'var(--text-muted)' }}>
                          {a.label}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>

                {/* Credentials */}
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
                    Credentials
                  </h2>
                  <div className="card p-5 space-y-4">
                    <CredRow label="Agent ID" value={agentId} />
                    <CredRow label="API Key (Bearer Token)" value={apiKey} secret />
                    <div className="flex items-start gap-2 rounded-lg p-3 text-sm"
                      style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', color: '#fcd34d' }}>
                      <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20" className="flex-shrink-0 mt-0.5">
                        <path fillRule="evenodd" d="M8.485 3.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 3.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                      </svg>
                      Keep your API key private. Anyone with it can act as your agent.
                    </div>
                  </div>
                </div>

                {/* Quotas */}
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
                    Resource Limits
                  </h2>
                  <div className="grid sm:grid-cols-3 gap-4">
                    {[
                      { val: '1 GB', label: 'Storage', desc: 'fs primitive', color: '#06b6d4' },
                      { val: '100 MB', label: 'Memory Cache', desc: 'mem primitive', color: '#a855f7' },
                      { val: '100/min', label: 'Rate Limit', desc: 'requests per minute', color: '#22c55e' },
                    ].map(q => (
                      <div key={q.label} className="card p-5">
                        <div className="text-2xl font-black mb-1" style={{ color: q.color }}>{q.val}</div>
                        <div className="text-sm font-semibold mb-0.5">{q.label}</div>
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{q.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Skills ── */}
            {activeTab === 'skills' && (
              <div>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="font-black text-lg">
                    Installed Skills
                    <span className="ml-2 text-sm font-normal" style={{ color: 'var(--text-muted)' }}>
                      ({installedSkills.length})
                    </span>
                  </h2>
                  <Link href="/marketplace" className="btn-outline text-sm px-4 py-2 rounded-lg">
                    + Browse marketplace
                  </Link>
                </div>

                {installedSkills.length === 0 ? (
                  <div className="card p-12 text-center">
                    <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                      style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
                      <svg width="24" height="24" fill="none" stroke="#a855f7" strokeWidth="1.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                      </svg>
                    </div>
                    <p className="font-bold mb-2">No skills installed yet</p>
                    <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                      Browse the marketplace and install skills to extend your agent.
                    </p>
                    <Link href="/marketplace" className="btn-primary px-6 py-2.5 rounded-lg text-sm">
                      Browse Skills
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {installedSkills.map(item => (
                      <div key={item.id} className="card p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 flex-1">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                              {item.skill.icon || '📦'}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <Link href={`/marketplace/${item.skill.slug}`}
                                  className="font-semibold hover:text-purple-400 transition-colors">
                                  {item.skill.name}
                                </Link>
                                {item.skill.verified && (
                                  <span className="badge badge-green text-xs">✓ Official</span>
                                )}
                                <span className="text-xs px-2 py-0.5 rounded"
                                  style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                                  {item.skill.category}
                                </span>
                              </div>
                              <p className="text-sm mb-2.5" style={{ color: 'var(--text-muted)' }}>{item.skill.description}</p>
                              <div className="flex flex-wrap gap-1.5">
                                {item.skill.capabilities?.slice(0, 4).map(c => (
                                  <span key={c.name} className="font-mono text-xs px-2 py-0.5 rounded"
                                    style={{ background: 'rgba(139,92,246,0.08)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
                                    {c.name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2 flex-shrink-0">
                            <span className="text-sm font-semibold" style={{ color: item.skill.pricing_model === 'free' ? '#86efac' : '#a78bfa' }}>
                              {item.skill.pricing_model === 'free' ? 'Free' : `$${item.skill.price_per_call}/call`}
                            </span>
                            <button onClick={() => uninstallSkill(item.skill.id)}
                              className="text-xs px-3 py-1.5 rounded-lg transition-all"
                              style={{ background: 'rgba(239,68,68,0.07)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)' }}>
                              Uninstall
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Activity ── */}
            {activeTab === 'activity' && (
              <div>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="font-black text-lg">Recent Activity</h2>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Audit log · Agent OS</span>
                </div>

                {recentAudit.length === 0 ? (
                  <div className="card p-12 text-center">
                    <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                      style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)' }}>
                      <svg width="24" height="24" fill="none" stroke="#06b6d4" strokeWidth="1.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                      </svg>
                    </div>
                    <p className="font-bold mb-2">No activity yet</p>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      All primitive operations (fs, net, proc, mem, db, events) will be logged here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recentAudit.map((entry, i) => {
                      const color = PRIM_COLORS[entry.primitive] ?? '#64748b';
                      return (
                        <div key={i} className="card p-4 flex items-center gap-4"
                          style={!entry.success ? { borderColor: 'rgba(239,68,68,0.3)' } : {}}>
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: `${color}12`, border: `1px solid ${color}25` }}>
                            <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                          </div>
                          <div className="flex-1">
                            <span className="font-mono text-sm font-bold" style={{ color }}>
                              {entry.primitive}.{entry.operation}
                            </span>
                            {entry.error && (
                              <p className="text-xs mt-0.5" style={{ color: '#fca5a5' }}>{entry.error}</p>
                            )}
                          </div>
                          <span className="text-xs px-2 py-0.5 rounded font-medium"
                            style={entry.success
                              ? { background: 'rgba(34,197,94,0.1)', color: '#86efac', border: '1px solid rgba(34,197,94,0.25)' }
                              : { background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.25)' }}>
                            {entry.success ? 'OK' : 'ERR'}
                          </span>
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{entry.duration_ms}ms</span>
                          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                            {new Date(entry.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Credential row
function CredRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const display = secret && !shown ? value.slice(0, 10) + '•••••••••••••••••••••' : value;

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 font-mono text-xs px-3 py-2.5 rounded-lg truncate"
          style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-bright)', color: '#a78bfa' }}>
          {display}
        </div>
        {secret && (
          <button onClick={() => setShown(s => !s)}
            className="text-xs px-3 py-2.5 rounded-lg transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-bright)', color: 'var(--text-muted)' }}>
            {shown ? 'Hide' : 'Show'}
          </button>
        )}
        <button onClick={copy}
          className="text-xs px-3 py-2.5 rounded-lg transition-all"
          style={copied
            ? { background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#86efac' }
            : { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-bright)', color: 'var(--text-muted)' }}>
          {copied ? '✓' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
