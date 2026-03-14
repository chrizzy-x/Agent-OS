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

/** Safely decode a JWT payload without throwing */
function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const b64 = token.split('.')[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

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
    if (!key) {
      router.replace('/signin');
      return;
    }
    setApiKey(key);
    const payload = decodeJwt(key);
    const id = (payload?.sub as string) || '';
    setAgentId(id);
    if (id) loadDashboard(key, id);
    else setLoading(false);
  }, [router]);

  const loadDashboard = async (key: string, _id: string) => {
    setLoading(true);
    await fetchInstalledSkills(key);
    setLoading(false);
  };

  const fetchInstalledSkills = async (key: string) => {
    try {
      const res = await fetch('/api/skills/installed', {
        headers: { Authorization: `Bearer ${key}` },
      });
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

  const primitiveEmoji: Record<string, string> = {
    fs: '🗂️', net: '🌐', proc: '⚙️', mem: '💾', db: '🗄️', events: '📡',
  };

  // Redirect is handled in useEffect; show nothing while redirecting
  if (!apiKey) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <DashNav agentId={agentId} onSignOut={handleSignOut} />

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Agent info bar */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-xl font-bold">
              {agentId ? agentId.slice(6, 8).toUpperCase() : '??'}
            </div>
            <div>
              <div className="font-semibold text-gray-900">My Agent</div>
              <div className="text-xs text-gray-400 font-mono">{agentId || 'Loading...'}</div>
            </div>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div className="text-center">
              <div className="font-bold text-gray-900">{installedSkills.length}</div>
              <div className="text-gray-400 text-xs">Skills</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-gray-900">100</div>
              <div className="text-gray-400 text-xs">Req/min</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-gray-900">1GB</div>
              <div className="text-gray-400 text-xs">Storage</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white border border-gray-200 rounded-lg p-1 w-fit">
          {(['overview', 'skills', 'activity'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors capitalize ${
                activeTab === tab
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse h-28" />
            ))}
          </div>
        ) : (
          <>
            {/* Overview tab */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Quick actions */}
                <div>
                  <h2 className="text-base font-semibold text-gray-900 mb-3">Quick Actions</h2>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <Link href="/marketplace"
                      className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 transition-all text-center group">
                      <div className="text-2xl mb-2">🛍️</div>
                      <div className="text-sm font-medium text-gray-700 group-hover:text-blue-600">Browse Skills</div>
                    </Link>
                    <Link href="/developer"
                      className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 transition-all text-center group">
                      <div className="text-2xl mb-2">🛠️</div>
                      <div className="text-sm font-medium text-gray-700 group-hover:text-blue-600">Publish Skill</div>
                    </Link>
                    <Link href="/docs"
                      className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 transition-all text-center group">
                      <div className="text-2xl mb-2">📚</div>
                      <div className="text-sm font-medium text-gray-700 group-hover:text-blue-600">Read Docs</div>
                    </Link>
                    <a href="/tools"
                      className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 transition-all text-center group">
                      <div className="text-2xl mb-2">🔧</div>
                      <div className="text-sm font-medium text-gray-700 group-hover:text-blue-600">Browse Tools</div>
                    </a>
                  </div>
                </div>

                {/* Credentials */}
                <div>
                  <h2 className="text-base font-semibold text-gray-900 mb-3">Credentials</h2>
                  <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
                    <CredRow label="Agent ID" value={agentId} />
                    <CredRow label="API Key" value={apiKey} secret />
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
                      ⚠ Keep your API key private. Anyone with it can act as your agent.
                    </p>
                  </div>
                </div>

                {/* Resource quotas */}
                <div>
                  <h2 className="text-base font-semibold text-gray-900 mb-3">Resource Limits</h2>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <QuotaCard label="Storage" value="1 GB" desc="Files via fs primitive" />
                    <QuotaCard label="Memory Cache" value="100 MB" desc="Keys via mem primitive" />
                    <QuotaCard label="Rate Limit" value="100/min" desc="Requests per minute" />
                  </div>
                </div>
              </div>
            )}

            {/* Skills tab */}
            {activeTab === 'skills' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-gray-900">
                    Installed Skills ({installedSkills.length})
                  </h2>
                  <Link href="/marketplace"
                    className="text-sm text-blue-600 hover:underline">
                    + Browse marketplace
                  </Link>
                </div>

                {installedSkills.length === 0 ? (
                  <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
                    <div className="text-4xl mb-3">📦</div>
                    <p className="text-gray-600 font-medium mb-2">No skills installed yet</p>
                    <p className="text-sm text-gray-500 mb-5">
                      Browse the marketplace and install skills to extend your agent&apos;s capabilities.
                    </p>
                    <Link href="/marketplace"
                      className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
                      Browse Skills
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {installedSkills.map(item => (
                      <div key={item.id} className="bg-white border border-gray-200 rounded-xl p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 flex-1">
                            <span className="text-2xl">{item.skill.icon || '📦'}</span>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Link href={`/marketplace/${item.skill.slug}`}
                                  className="font-semibold text-gray-900 hover:text-blue-600">
                                  {item.skill.name}
                                </Link>
                                {item.skill.verified && (
                                  <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">✓ Official</span>
                                )}
                                <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                                  {item.skill.category}
                                </span>
                              </div>
                              <p className="text-sm text-gray-500 mb-2">{item.skill.description}</p>
                              <div className="flex flex-wrap gap-1">
                                {item.skill.capabilities?.slice(0, 4).map(c => (
                                  <span key={c.name}
                                    className="text-xs bg-blue-50 text-blue-700 border border-blue-100 rounded px-2 py-0.5 font-mono">
                                    {c.name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-medium ${item.skill.pricing_model === 'free' ? 'text-green-600' : 'text-blue-600'}`}>
                              {item.skill.pricing_model === 'free' ? 'Free' : `$${item.skill.price_per_call}/call`}
                            </span>
                            <button onClick={() => uninstallSkill(item.skill.id)}
                              className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 rounded px-2 py-1 transition-colors">
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

            {/* Activity tab */}
            {activeTab === 'activity' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-gray-900">Recent Activity</h2>
                  <p className="text-xs text-gray-400">Audit log powered by Agent OS</p>
                </div>

                {recentAudit.length === 0 ? (
                  <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
                    <div className="text-4xl mb-3">📋</div>
                    <p className="text-gray-600 font-medium mb-1">No recent activity</p>
                    <p className="text-sm text-gray-500">
                      All primitive operations (fs, net, proc, mem, db, events) are logged here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recentAudit.map((entry, i) => (
                      <div key={i}
                        className={`flex items-start gap-3 bg-white border rounded-lg p-3 ${
                          entry.success ? 'border-gray-200' : 'border-red-200 bg-red-50'
                        }`}>
                        <span className="text-lg">{primitiveEmoji[entry.primitive] ?? '⚡'}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-mono font-semibold text-gray-800">
                              {entry.primitive}.{entry.operation}
                            </span>
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                              entry.success
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {entry.success ? 'OK' : 'ERR'}
                            </span>
                            <span className="text-gray-400 text-xs">{entry.duration_ms}ms</span>
                          </div>
                          {entry.error && (
                            <p className="text-xs text-red-600 mt-0.5">{entry.error}</p>
                          )}
                        </div>
                        <div className="text-xs text-gray-400">
                          {new Date(entry.created_at).toLocaleTimeString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <p className="mt-4 text-xs text-gray-400 text-center">
                  Full audit log available via <code className="font-mono bg-gray-100 px-1 rounded">/ffp/audit/{'{agentId}'}</code> (admin only)
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Sub-components

function DashNav({ agentId, onSignOut }: { agentId: string; onSignOut: () => void }) {
  return (
    <nav className="bg-white border-b border-gray-100">
      <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-mono font-bold text-lg text-gray-900">Agent OS</Link>
          <div className="hidden sm:flex items-center gap-4 text-sm text-gray-500">
            <Link href="/marketplace" className="hover:text-gray-900">Marketplace</Link>
            <Link href="/developer" className="hover:text-gray-900">Developer</Link>
            <Link href="/docs" className="hover:text-gray-900">Docs</Link>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {agentId && (
            <span className="hidden sm:block text-xs font-mono text-gray-400 bg-gray-50 border border-gray-200 px-2 py-1 rounded">
              {agentId.slice(0, 20)}...
            </span>
          )}
          <button onClick={onSignOut}
            className="text-sm text-gray-500 hover:text-gray-900 border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-md transition-colors">
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}

function CredRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const display = secret && !shown
    ? value.slice(0, 8) + '••••••••••••••••'
    : value;

  return (
    <div>
      <div className="text-xs font-medium text-gray-500 mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <div className="flex-1 font-mono text-xs bg-gray-50 border border-gray-200 rounded px-3 py-2 text-gray-700 overflow-hidden text-ellipsis whitespace-nowrap">
          {display}
        </div>
        {secret && (
          <button onClick={() => setShown(s => !s)}
            className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-2">
            {shown ? '🙈' : '👁'}
          </button>
        )}
        <button onClick={copy}
          className={`text-xs border rounded px-2 py-2 transition-colors ${
            copied ? 'bg-green-50 text-green-700 border-green-200' : 'text-gray-500 hover:text-gray-700 border-gray-200'
          }`}>
          {copied ? '✓' : '📋'}
        </button>
      </div>
    </div>
  );
}

function QuotaCard({ label, value, desc }: { label: string; value: string; desc: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="text-2xl font-bold text-blue-600 mb-0.5">{value}</div>
      <div className="text-sm font-medium text-gray-800">{label}</div>
      <div className="text-xs text-gray-500 mt-0.5">{desc}</div>
    </div>
  );
}
