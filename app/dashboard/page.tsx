'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  clearLegacyBrowserAuth,
  destroyBrowserSession,
  fetchBrowserSession,
  issueBrowserToken,
  type BrowserSession,
} from '@/src/auth/browser-session';

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

interface FfpOperation {
  id?: string;
  chain_id?: string;
  tool?: string;
  status?: string;
  created_at?: string;
  [key: string]: unknown;
}

interface FfpProposal {
  id?: string;
  status?: string;
  votes?: number;
  threshold?: number;
  created_at?: string;
  [key: string]: unknown;
}

interface DeployedAgent {
  agent_id: string;
  name: string;
  description: string | null;
  status: string | null;
  total_calls: number | null;
  last_active_at: string | null;
  created_at: string;
  allowed_tools: string[] | null;
  allowed_domains: string[] | null;
}

interface AgentActivityEntry {
  primitive: string;
  operation: string;
  success: boolean;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
}

interface CommandPlanStep {
  order: number;
  tool: string;
  description: string;
  input: Record<string, unknown>;
}

interface CommandPlan {
  summary: string;
  steps: CommandPlanStep[];
  schedule: string | null;
  confirmToken: string;
}

interface CommandResult {
  executed: boolean;
  results: Array<{ step: number; tool: string; result: unknown }>;
  workflowId: string | null;
}

const PRIM_COLORS: Record<string, string> = {
  fs: 'var(--accent)', net: 'var(--accent)', proc: 'var(--accent)',
  mem: 'var(--accent)', db: 'var(--accent)', events: 'var(--accent)',
};

function SessionTokenPanel() {
  const [bearerToken, setBearerToken] = useState('');
  const [expiresIn, setExpiresIn] = useState('');
  const [loading, setLoading] = useState(false);
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  async function handleGenerate() {
    setLoading(true);
    setError('');
    try {
      const credentials = await issueBrowserToken();
      setBearerToken(credentials.bearerToken);
      setExpiresIn(credentials.expiresIn);
      setShown(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate a bearer token');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(bearerToken);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
        Bearer Token
      </div>
      {!bearerToken ? (
        <div className="rounded-lg p-4" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-bright)' }}>
          <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
            Your browser session is already authenticated. Generate a fresh bearer token only when you need to call the API from code, CLI tools, or another machine.
          </p>
          <button onClick={() => void handleGenerate()} disabled={loading} className="btn-primary text-xs px-4 py-2 rounded-lg">
            {loading ? 'Generating...' : 'Generate bearer token'}
          </button>
          {error && <p className="text-xs mt-2" style={{ color: '#fca5a5' }}>{error}</p>}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 font-mono text-xs px-3 py-2.5 rounded-lg truncate"
              style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-bright)', color: '#a78bfa' }}>
              {shown ? bearerToken : `${bearerToken.slice(0, 12)}••••••••••••••••••••`}
            </div>
            <button onClick={() => setShown(value => !value)} className="text-xs px-3 py-2.5 rounded-lg transition-all"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-bright)', color: 'var(--text-muted)' }}>
              {shown ? 'Hide' : 'Show'}
            </button>
            <button onClick={() => void handleCopy()} className="text-xs px-3 py-2.5 rounded-lg transition-all"
              style={copied
                ? { background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#86efac' }
                : { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-bright)', color: 'var(--text-muted)' }}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Expires in {expiresIn}</div>
        </div>
      )}
    </div>
  );
}

type AgentTier = 'free' | 'pro' | 'hyper';

interface AgentProfile {
  tier: AgentTier;
  quotas: { storageQuotaBytes: number; memoryQuotaBytes: number; rateLimitPerMin: number };
}

function TierBadge({ tier }: { tier: AgentTier }) {
  if (tier === 'hyper') {
    return (
      <span className="text-xs font-bold px-2 py-0.5"
        style={{ background: 'var(--accent)', color: 'var(--bg-primary)' }}>
        HYPER
      </span>
    );
  }
  if (tier === 'pro') {
    return (
      <span className="badge badge-accent text-xs font-bold">PRO</span>
    );
  }
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ background: 'rgba(100,116,139,0.15)', border: '1px solid rgba(100,116,139,0.3)', color: '#94a3b8' }}>
      FREE
    </span>
  );
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(0)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [installedSkills, setInstalledSkills] = useState<InstalledSkill[]>([]);
  const [recentAudit, setRecentAudit] = useState<AuditEntry[]>([]);
  const [activityTabLoading, setActivityTabLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'agents' | 'skills' | 'activity' | 'ffp' | 'eval'>('overview');
  const [ffpAudit, setFfpAudit] = useState<FfpOperation[]>([]);
  const [ffpConsensus, setFfpConsensus] = useState<FfpProposal[]>([]);
  const [ffpLoading, setFfpLoading] = useState(false);
  const [agentProfile, setAgentProfile] = useState<AgentProfile | null>(null);
  const [evalSuites, setEvalSuites] = useState<Array<{ id: string; name: string; createdAt: string }>>([]);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalLastRuns, setEvalLastRuns] = useState<Record<string, { score: number | null; passCount: number; failCount: number; status: string }>>({});
  const [deployingTemplate, setDeployingTemplate] = useState<string | null>(null);
  const [deployResult, setDeployResult] = useState<{ agentId: string; apiKey: string } | null>(null);
  const [deployedAgents, setDeployedAgents] = useState<DeployedAgent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [agentActivity, setAgentActivity] = useState<Record<string, AgentActivityEntry[]>>({});
  const [activityLoading, setActivityLoading] = useState<string | null>(null);
  const [copiedAgentId, setCopiedAgentId] = useState<string | null>(null);
  const [expandedPanel, setExpandedPanel] = useState<Record<string, 'activity' | 'command' | null>>({});
  const [commandDraft, setCommandDraft] = useState<Record<string, string>>({});
  const [commandPlan, setCommandPlan] = useState<Record<string, CommandPlan | null>>({});
  const [commandLoading, setCommandLoading] = useState<string | null>(null);
  const [commandError, setCommandError] = useState<Record<string, string | null>>({});
  const [commandResults, setCommandResults] = useState<Record<string, CommandResult | null>>({});

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const currentSession = await fetchBrowserSession();
      if (!active) return;
      if (!currentSession) {
        clearLegacyBrowserAuth();
        router.replace('/signin');
        return;
      }

      setSession(currentSession);
      try {
        const [skillsRes, profileRes] = await Promise.all([
          fetch('/api/skills/installed'),
          fetch('/api/agent/me'),
        ]);
        const skillsData = await skillsRes.json();
        const profileData = await profileRes.json();
        if (active) {
          setInstalledSkills(skillsData.installed_skills ?? []);
          if (profileData.tier) {
            setAgentProfile({ tier: profileData.tier, quotas: profileData.quotas });
          }
        }
      } catch {
        if (active) {
          setInstalledSkills([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void bootstrap();
    return () => { active = false; };
  }, [router]);

  const loadFfp = async () => {
    if (ffpLoading) return;
    setFfpLoading(true);
    try {
      const [auditRes, consensusRes] = await Promise.all([
        fetch('/api/agent/ffp/audit'),
        fetch('/api/agent/ffp/consensus'),
      ]);
      const auditData = await auditRes.json();
      const consensusData = await consensusRes.json();
      setFfpAudit(auditData.operations ?? []);
      setFfpConsensus(consensusData.proposals ?? []);
    } catch { /* keep existing */ }
    finally { setFfpLoading(false); }
  };

  const loadEval = async () => {
    if (evalLoading) return;
    setEvalLoading(true);
    try {
      const res = await fetch('/eval/suites', { headers: { 'Content-Type': 'application/json' } });
      const data = await res.json();
      const suites = data.suites ?? [];
      setEvalSuites(suites);
      const runMap: Record<string, { score: number | null; passCount: number; failCount: number; status: string }> = {};
      await Promise.all(suites.map(async (suite: { id: string }) => {
        try {
          const runsRes = await fetch(`/eval/suites/${suite.id}/runs`);
          const runsData = await runsRes.json();
          const runs: Array<{ score: number | null; pass_count: number; fail_count: number; status: string }> = runsData.runs ?? [];
          if (runs.length > 0) {
            const last = runs[0];
            runMap[suite.id] = { score: last.score, passCount: last.pass_count, failCount: last.fail_count, status: last.status };
          }
        } catch { /* keep empty */ }
      }));
      setEvalLastRuns(runMap);
    } catch { /* keep existing */ }
    finally { setEvalLoading(false); }
  };

  const loadActivity = async () => {
    if (activityTabLoading) return;
    setActivityTabLoading(true);
    try {
      const res = await fetch('/api/agent/activity?limit=50');
      const data = await res.json() as { activity?: AuditEntry[] };
      if (res.ok) setRecentAudit(data.activity ?? []);
    } catch { /* keep existing */ }
    finally { setActivityTabLoading(false); }
  };

  const loadAgents = async () => {
    if (agentsLoading) return;
    setAgentsLoading(true);
    setAgentsError(null);
    try {
      const res = await fetch('/api/agents');
      const data = await res.json() as { agents?: DeployedAgent[]; error?: string };
      if (!res.ok) {
        setAgentsError(data.error ?? `Error ${res.status}`);
      } else {
        setDeployedAgents(data.agents ?? []);
      }
    } catch (e) {
      setAgentsError(e instanceof Error ? e.message : 'Network error');
    } finally { setAgentsLoading(false); }
  };

  const loadAgentActivity = async (agentId: string) => {
    if (activityLoading === agentId) return;
    setActivityLoading(agentId);
    try {
      const res = await fetch(`/api/agents/${agentId}/activity`);
      const data = await res.json() as { activity?: AgentActivityEntry[] };
      setAgentActivity(prev => ({ ...prev, [agentId]: data.activity ?? [] }));
    } catch { /* keep empty */ }
    finally { setActivityLoading(null); }
  };

  const copyAgentId = async (agentId: string) => {
    await navigator.clipboard.writeText(agentId);
    setCopiedAgentId(agentId);
    window.setTimeout(() => setCopiedAgentId(null), 1500);
  };

  const togglePanel = (agentId: string, panel: 'activity' | 'command') => {
    setExpandedPanel(prev => ({ ...prev, [agentId]: prev[agentId] === panel ? null : panel }));
    if (panel === 'activity' && expandedPanel[agentId] !== 'activity') {
      void loadAgentActivity(agentId);
    }
  };

  const sendAgentCommand = async (agentId: string) => {
    const instruction = commandDraft[agentId]?.trim();
    if (!instruction || commandLoading === agentId) return;
    setCommandLoading(agentId);
    setCommandError(prev => ({ ...prev, [agentId]: null }));
    setCommandPlan(prev => ({ ...prev, [agentId]: null }));
    setCommandResults(prev => ({ ...prev, [agentId]: null }));
    try {
      const res = await fetch(`/api/agents/${agentId}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction }),
      });
      const data = await res.json() as CommandPlan & { error?: string };
      if (!res.ok) { setCommandError(prev => ({ ...prev, [agentId]: data.error ?? `Error ${res.status}` })); return; }
      setCommandPlan(prev => ({ ...prev, [agentId]: data }));
    } catch (e) {
      setCommandError(prev => ({ ...prev, [agentId]: e instanceof Error ? e.message : 'Network error' }));
    } finally { setCommandLoading(null); }
  };

  const confirmAgentCommand = async (agentId: string, confirmToken: string) => {
    if (commandLoading === agentId) return;
    setCommandLoading(agentId);
    setCommandError(prev => ({ ...prev, [agentId]: null }));
    try {
      const res = await fetch(`/api/agents/${agentId}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true, confirmToken }),
      });
      const data = await res.json() as CommandResult & { error?: string };
      if (!res.ok) { setCommandError(prev => ({ ...prev, [agentId]: data.error ?? `Error ${res.status}` })); return; }
      setCommandPlan(prev => ({ ...prev, [agentId]: null }));
      setCommandResults(prev => ({ ...prev, [agentId]: data }));
      setCommandDraft(prev => ({ ...prev, [agentId]: '' }));
      void loadAgents();
    } catch (e) {
      setCommandError(prev => ({ ...prev, [agentId]: e instanceof Error ? e.message : 'Network error' }));
    } finally { setCommandLoading(null); }
  };

  const deployTemplate = async (templateId: string) => {
    setDeployingTemplate(templateId);
    setDeployResult(null);
    try {
      const res = await fetch('/agents/from-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: templateId }),
      });
      const data = await res.json();
      if (res.ok && data.agentId && data.apiKey) {
        setDeployResult({ agentId: data.agentId, apiKey: data.apiKey });
        void loadAgents();
      }
    } catch { /* show nothing */ }
    finally { setDeployingTemplate(null); }
  };

  const handleSignOut = async () => {
    await destroyBrowserSession();
    router.push('/signin');
  };

  const uninstallSkill = async (skillId: string) => {
    if (!confirm('Uninstall this skill?')) return;
    const previous = installedSkills;
    setInstalledSkills(current => current.filter(item => item.skill.id !== skillId));
    try {
      const res = await fetch('/api/skills/uninstall', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill_id: skillId }),
      });
      if (!res.ok) {
        setInstalledSkills(previous);
      }
    } catch {
      setInstalledSkills(previous);
    }
  };

  if (loading || !session) {
    return <div className="min-h-screen" style={{ background: 'var(--bg)' }} />;
  }

  const initials = session.agentId.slice(6, 8).toUpperCase() || '??';

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
              <Link href="/marketplace" className="hover:text-white transition-colors">Skill Store</Link>
              <Link href="/appstore" className="hover:text-white transition-colors">App Store</Link>
              <Link href="/connect" className="hover:text-white transition-colors">Connect</Link>
              <Link href="/studio" className="hover:text-white transition-colors">Studio</Link>
              <Link href="/developer" className="hover:text-white transition-colors">Developer</Link>
              <Link href="/workspaces" className="hover:text-white transition-colors">Workspaces</Link>
              <Link href="/docs" className="hover:text-white transition-colors">Docs</Link>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block font-mono text-xs px-2.5 py-1.5 rounded-lg"
              style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', color: '#a78bfa' }}>
              {session.agentId.slice(0, 22)}…
            </span>
            <button onClick={() => void handleSignOut()} className="btn-outline text-sm px-3 py-1.5 rounded-lg">
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-5 py-8">
        <div className="card p-5 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 flex items-center justify-center font-black text-sm font-mono flex-shrink-0"
              style={{ background: 'var(--accent-glow)', border: '1px solid var(--accent)', color: 'var(--accent)' }}>
              {initials}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold">{session.agentName || 'My Agent'}</span>
                {agentProfile && <TierBadge tier={agentProfile.tier} />}
              </div>
              <div className="font-mono text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {session.agentId}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-6 sm:gap-8">
            {[
              { val: installedSkills.length.toString(), label: 'Skills' },
              { val: '90d', label: 'Session TTL' },
              { val: agentProfile ? formatBytes(agentProfile.quotas.storageQuotaBytes) : '1 GB', label: 'Storage' },
              { val: agentProfile ? `${agentProfile.quotas.rateLimitPerMin}/min` : '60/min', label: 'Rate limit' },
            ].map(s => (
              <div key={s.label} className="text-center">
                <div className="text-xl font-black" style={{ color: 'var(--accent)' }}>{s.val}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-1 mb-6 p-1 rounded-lg w-fit"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {(['overview', 'agents', 'skills', 'activity', 'ffp', 'eval'] as const).map(tab => (
            <button key={tab} onClick={() => { setActiveTab(tab); if (tab === 'ffp') void loadFfp(); if (tab === 'eval') void loadEval(); if (tab === 'agents') void loadAgents(); if (tab === 'activity') void loadActivity(); }}
              className="px-4 py-2 text-sm font-medium rounded-md capitalize transition-all"
              style={activeTab === tab
                ? { background: 'var(--accent)', color: 'var(--bg-primary)', boxShadow: '0 0 16px var(--accent-glow)' }
                : { color: 'var(--text-secondary)' }}
            >
              {tab === 'ffp' ? 'FFP' : tab}
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
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
                    Quick Actions
                  </h2>
                  <div className="grid sm:grid-cols-2 xl:grid-cols-7 gap-3">
                    {[
                      { href: '/marketplace', label: 'Browse Skills', color: 'var(--accent)' },
                      { href: '/appstore', label: 'Browse Apps', color: '#22c55e' },
                      { href: '/developer', label: 'Publish Skill', color: 'var(--accent)' },
                      { href: '/docs', label: 'Read Docs', color: 'var(--accent)' },
                      { href: '/studio', label: 'Studio Console', color: '#8b5cf6' },
                      { href: '/ops', label: 'Ops Console', color: '#f59e0b' },
                      { href: '#ffp', label: 'FFP & Consensus', color: '#22c55e' },
                    ].map(a => (
                      <Link key={a.href} href={a.href} onClick={a.href === '#ffp' ? (e) => { e.preventDefault(); setActiveTab('ffp'); void loadFfp(); } : undefined} className="card p-5 flex flex-col items-start gap-3 group">
                        <div className="w-9 h-9 rounded-lg" style={{ background: `${a.color}12`, border: `1px solid ${a.color}25` }} />
                        <span className="text-sm font-medium group-hover:text-white transition-colors" style={{ color: 'var(--text-muted)' }}>
                          {a.label}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>

                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
                    Agent Templates
                  </h2>
                  {deployResult && (
                    <div className="mb-4 card p-4 space-y-2" style={{ borderColor: 'rgba(34,197,94,0.4)' }}>
                      <p className="text-sm font-semibold" style={{ color: '#86efac' }}>Agent deployed!</p>
                      <div className="font-mono text-xs break-all" style={{ color: 'var(--text-muted)' }}>ID: {deployResult.agentId}</div>
                      <div className="font-mono text-xs break-all px-3 py-2 rounded-lg" style={{ background: 'rgba(0,0,0,0.4)', color: '#a78bfa', border: '1px solid var(--border-bright)' }}>
                        {deployResult.apiKey}
                      </div>
                      <button onClick={() => setDeployResult(null)} className="text-xs" style={{ color: 'var(--text-muted)' }}>Dismiss</button>
                    </div>
                  )}
                  <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {[
                      { id: 'research-agent', name: 'Research Agent', desc: 'Web research + knowledge storage', color: '#3b82f6' },
                      { id: 'trading-monitor', name: 'Trading Monitor', desc: 'Price feeds + alerts', color: '#f59e0b' },
                      { id: 'social-manager', name: 'Social Manager', desc: 'Scheduled social posts', color: '#ec4899' },
                      { id: 'data-pipeline', name: 'Data Pipeline', desc: 'ETL, transform + store', color: '#8b5cf6' },
                      { id: 'security-sentinel', name: 'Security Sentinel', desc: 'Endpoint monitoring', color: '#ef4444' },
                      { id: 'customer-support', name: 'Customer Support', desc: 'FAQ + ticket logging', color: '#22c55e' },
                    ].map(t => (
                      <div key={t.id} className="card p-5 flex flex-col gap-3">
                        <div className="w-9 h-9 rounded-lg flex-shrink-0" style={{ background: `${t.color}18`, border: `1px solid ${t.color}30` }} />
                        <div>
                          <div className="font-semibold text-sm">{t.name}</div>
                          <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{t.desc}</div>
                        </div>
                        <button
                          onClick={() => void deployTemplate(t.id)}
                          disabled={deployingTemplate === t.id}
                          className="btn-primary text-xs px-3 py-1.5 rounded-lg mt-auto"
                        >
                          {deployingTemplate === t.id ? 'Deploying…' : 'Deploy'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
                    Credentials
                  </h2>
                  <div className="card p-5 space-y-4">
                    <CredRow label="Agent ID" value={session.agentId} />
                    <SessionTokenPanel />
                    <div className="flex items-start gap-2 rounded-lg p-3 text-sm"
                      style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', color: '#fcd34d' }}>
                      <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20" className="flex-shrink-0 mt-0.5">
                        <path fillRule="evenodd" d="M8.485 3.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 3.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                      </svg>
                      The browser uses a secure session cookie. Generate a bearer token only for explicit API or SDK use outside the app.
                    </div>
                  </div>
                </div>

                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
                    Resource Limits
                  </h2>
                  <div className="grid sm:grid-cols-3 gap-4">
                    {[
                      { val: '1 GB', label: 'Storage', desc: 'fs primitive', color: 'var(--accent)' },
                      { val: '100 MB', label: 'Memory Cache', desc: 'mem primitive', color: 'var(--accent)' },
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
                    + Browse skills
                  </Link>
                </div>

                {installedSkills.length === 0 ? (
                  <div className="card p-12 text-center">
                    <div className="w-14 h-14 rounded-2xl mx-auto mb-4" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }} />
                    <p className="font-bold mb-2">No skills installed yet</p>
                    <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                      Browse the Skill Store and install capabilities to extend your agent.
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
                              {item.skill.icon || '??'}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <Link href={`/marketplace/${item.skill.slug}`}
                                  className="font-semibold hover:text-purple-400 transition-colors">
                                  {item.skill.name}
                                </Link>
                                {item.skill.verified && (
                                  <span className="badge badge-green text-xs">Official</span>
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
                            <button onClick={() => void uninstallSkill(item.skill.id)}
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

            {activeTab === 'ffp' && (
              <div className="space-y-6">
                {ffpLoading ? (
                  <div className="grid sm:grid-cols-2 gap-4">
                    {[...Array(4)].map((_, i) => <div key={i} className="card h-24 animate-pulse" />)}
                  </div>
                ) : (
                  <>
                    {/* Audit Trail */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="font-black text-lg">Audit Trail</h2>
                        <button onClick={() => void loadFfp()} className="btn-outline text-xs px-3 py-1.5 rounded-lg">Refresh</button>
                      </div>
                      {ffpAudit.length === 0 ? (
                        <div className="card p-10 text-center">
                          <p className="font-bold mb-1">No operations recorded</p>
                          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                            FFP will log every tool call your agent makes once it is enabled and configured.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {ffpAudit.map((op, i) => (
                            <div key={op.id ?? i} className="card p-4 flex items-center gap-4">
                              <div className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ background: op.status === 'approved' ? '#22c55e' : op.status === 'rejected' ? '#ef4444' : '#f59e0b' }} />
                              <div className="flex-1">
                                <div className="font-mono text-sm font-semibold">{op.tool ?? 'unknown'}</div>
                                {op.chain_id && <div className="text-xs" style={{ color: 'var(--text-dim)' }}>chain: {String(op.chain_id)}</div>}
                              </div>
                              <span className="text-xs px-2 py-0.5 rounded font-medium"
                                style={op.status === 'approved'
                                  ? { background: 'rgba(34,197,94,0.1)', color: '#86efac', border: '1px solid rgba(34,197,94,0.25)' }
                                  : op.status === 'rejected'
                                  ? { background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.25)' }
                                  : { background: 'rgba(245,158,11,0.1)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.25)' }}>
                                {String(op.status ?? 'pending')}
                              </span>
                              {op.created_at && (
                                <span className="text-xs hidden sm:block" style={{ color: 'var(--text-dim)' }}>
                                  {new Date(String(op.created_at)).toLocaleString()}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Consensus History */}
                    <div>
                      <h2 className="font-black text-lg mb-4">Consensus History</h2>
                      {ffpConsensus.length === 0 ? (
                        <div className="card p-10 text-center">
                          <p className="font-bold mb-1">No consensus proposals yet</p>
                          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                            Sensitive operations will appear here when they require multi-party approval.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {ffpConsensus.map((p, i) => (
                            <div key={p.id ?? i} className="card p-4 flex items-center gap-4">
                              <div className="flex-1">
                                <div className="font-mono text-sm font-semibold">{p.id ? `Proposal ${String(p.id).slice(0, 8)}` : `Proposal #${i + 1}`}</div>
                                {p.votes !== undefined && p.threshold !== undefined && (
                                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                    {String(p.votes)} / {String(p.threshold)} votes
                                  </div>
                                )}
                              </div>
                              <span className="text-xs px-2 py-0.5 rounded font-medium"
                                style={p.status === 'approved'
                                  ? { background: 'rgba(34,197,94,0.1)', color: '#86efac', border: '1px solid rgba(34,197,94,0.25)' }
                                  : p.status === 'rejected'
                                  ? { background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.25)' }
                                  : { background: 'rgba(245,158,11,0.1)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.25)' }}>
                                {String(p.status ?? 'pending')}
                              </span>
                              {p.created_at && (
                                <span className="text-xs hidden sm:block" style={{ color: 'var(--text-dim)' }}>
                                  {new Date(String(p.created_at)).toLocaleString()}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'eval' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="font-black text-lg">Eval Suites</h2>
                  <button
                    onClick={async () => {
                      const name = window.prompt('Suite name:');
                      if (!name?.trim()) return;
                      await fetch('/eval/suites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) });
                      void loadEval();
                    }}
                    className="btn-outline text-sm px-4 py-2 rounded-lg"
                  >
                    + New Suite
                  </button>
                </div>

                {evalLoading ? (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, i) => <div key={i} className="card h-20 animate-pulse" />)}
                  </div>
                ) : evalSuites.length === 0 ? (
                  <div className="card p-12 text-center">
                    <div className="w-14 h-14 rounded-2xl mx-auto mb-4" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }} />
                    <p className="font-bold mb-2">No eval suites yet</p>
                    <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                      Create a suite, add test cases, and run evals to measure agent behavior over time.
                    </p>
                    <button
                      onClick={async () => {
                        const name = window.prompt('Suite name:');
                        if (!name?.trim()) return;
                        await fetch('/eval/suites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) });
                        void loadEval();
                      }}
                      className="btn-primary px-6 py-2.5 rounded-lg text-sm"
                    >
                      Create First Suite
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {evalSuites.map(suite => {
                      const run = evalLastRuns[suite.id];
                      const pct = run?.score != null ? Math.round(run.score * 100) : null;
                      return (
                        <div key={suite.id} className="card p-5">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1">
                              <div className="font-semibold">{suite.name}</div>
                              <div className="font-mono text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{suite.id.slice(0, 8)}</div>
                            </div>
                            {run ? (
                              <div className="flex items-center gap-3">
                                <span className="text-xs px-2 py-0.5 rounded font-medium"
                                  style={run.status === 'complete'
                                    ? { background: 'rgba(34,197,94,0.1)', color: '#86efac', border: '1px solid rgba(34,197,94,0.25)' }
                                    : run.status === 'failed'
                                    ? { background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.25)' }
                                    : { background: 'rgba(245,158,11,0.1)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.25)' }}>
                                  {run.status}
                                </span>
                                {pct != null && (
                                  <span className="font-black text-lg" style={{ color: pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444' }}>
                                    {pct}%
                                  </span>
                                )}
                                <div className="text-xs text-right" style={{ color: 'var(--text-muted)' }}>
                                  <div>{run.passCount} pass</div>
                                  <div>{run.failCount} fail</div>
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>No runs yet</span>
                            )}
                            <button
                              onClick={async () => {
                                await fetch(`/eval/suites/${suite.id}/run`, { method: 'POST' });
                                void loadEval();
                              }}
                              className="btn-outline text-xs px-3 py-1.5 rounded-lg flex-shrink-0"
                            >
                              Run
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'agents' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="font-black text-lg">
                    My Agents
                    <span className="ml-2 text-sm font-normal" style={{ color: 'var(--text-muted)' }}>
                      ({deployedAgents.length})
                    </span>
                  </h2>
                  <button onClick={() => void loadAgents()} className="btn-outline text-xs px-3 py-1.5 rounded-lg">
                    Refresh
                  </button>
                </div>

                {agentsError && (
                  <div className="card p-4 mb-4 text-sm" style={{ borderColor: 'rgba(239,68,68,0.4)', color: '#fca5a5' }}>
                    Failed to load agents: {agentsError}
                  </div>
                )}

                {agentsLoading ? (
                  <div className="grid sm:grid-cols-2 gap-4">
                    {[...Array(4)].map((_, i) => <div key={i} className="card h-32 animate-pulse" />)}
                  </div>
                ) : deployedAgents.length === 0 && !agentsError ? (
                  <div className="card p-12 text-center">
                    <div className="w-14 h-14 rounded-2xl mx-auto mb-4" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }} />
                    <p className="font-bold mb-2">No agents deployed yet</p>
                    <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                      Use the Deploy buttons in the Overview tab, or type &ldquo;create an agent&rdquo; in Studio.
                    </p>
                    <button onClick={() => setActiveTab('overview')} className="btn-primary px-6 py-2.5 rounded-lg text-sm">
                      Go to Overview
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {deployedAgents.map(agent => {
                      const isActive = (agent.status ?? 'active') === 'active';
                      const panel = expandedPanel[agent.agent_id] ?? null;
                      const activity = agentActivity[agent.agent_id] ?? [];
                      const isLoadingActivity = activityLoading === agent.agent_id;
                      const lastSeen = agent.last_active_at
                        ? new Date(agent.last_active_at).toLocaleString()
                        : 'Never';
                      const plan = commandPlan[agent.agent_id] ?? null;
                      const cmdResult = commandResults[agent.agent_id] ?? null;
                      const cmdError = commandError[agent.agent_id] ?? null;
                      const isCmdLoading = commandLoading === agent.agent_id;
                      return (
                        <div key={agent.agent_id} className="card overflow-hidden">
                          <div className="p-5">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className="font-semibold">{agent.name}</span>
                                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                                    style={isActive
                                      ? { background: 'rgba(34,197,94,0.1)', color: '#86efac', border: '1px solid rgba(34,197,94,0.25)' }
                                      : { background: 'rgba(100,116,139,0.1)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.25)' }}>
                                    {isActive ? 'active' : agent.status ?? 'inactive'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <code className="font-mono text-xs truncate" style={{ color: '#a78bfa' }}>
                                    {agent.agent_id}
                                  </code>
                                  <button
                                    onClick={() => void copyAgentId(agent.agent_id)}
                                    className="text-xs flex-shrink-0"
                                    style={{ color: 'var(--text-muted)' }}
                                  >
                                    {copiedAgentId === agent.agent_id ? 'Copied!' : 'Copy'}
                                  </button>
                                </div>
                                {agent.description && (
                                  <p className="text-sm mt-1.5" style={{ color: 'var(--text-muted)' }}>{agent.description}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <button
                                  onClick={() => togglePanel(agent.agent_id, 'command')}
                                  className="btn-primary text-xs px-3 py-1.5 rounded-lg"
                                >
                                  {panel === 'command' ? 'Close' : 'Command'}
                                </button>
                                <button
                                  onClick={() => togglePanel(agent.agent_id, 'activity')}
                                  className="btn-outline text-xs px-3 py-1.5 rounded-lg"
                                  disabled={isLoadingActivity}
                                >
                                  {isLoadingActivity ? 'Loading…' : panel === 'activity' ? 'Hide' : 'Activity'}
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4 mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                              <div className="text-center">
                                <div className="text-xl font-black" style={{ color: 'var(--accent)' }}>
                                  {agent.total_calls ?? 0}
                                </div>
                                <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Total Calls</div>
                              </div>
                              <div className="text-center">
                                <div className="text-xs font-semibold truncate" style={{ color: 'var(--text-secondary)' }}>
                                  {lastSeen}
                                </div>
                                <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Last Active</div>
                              </div>
                              <div className="text-center">
                                <div className="text-xs font-semibold truncate" style={{ color: 'var(--text-secondary)' }}>
                                  {new Date(agent.created_at).toLocaleDateString()}
                                </div>
                                <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Deployed</div>
                              </div>
                            </div>
                          </div>

                          {/* Command Panel */}
                          {panel === 'command' && (
                            <div style={{ borderTop: '1px solid var(--border)', background: 'rgba(0,0,0,0.3)' }}>
                              <div className="px-5 py-3">
                                <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
                                  Send Command
                                </div>

                                {!plan && !cmdResult && (
                                  <div className="flex gap-2">
                                    <textarea
                                      value={commandDraft[agent.agent_id] ?? ''}
                                      onChange={e => setCommandDraft(prev => ({ ...prev, [agent.agent_id]: e.target.value }))}
                                      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void sendAgentCommand(agent.agent_id); }}
                                      placeholder="Tell this agent what to do… (Cmd+Enter to submit)"
                                      rows={2}
                                      className="flex-1 text-sm px-3 py-2 rounded-lg resize-none"
                                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-bright)', color: 'var(--text)', outline: 'none' }}
                                    />
                                    <button
                                      onClick={() => void sendAgentCommand(agent.agent_id)}
                                      disabled={isCmdLoading || !(commandDraft[agent.agent_id]?.trim())}
                                      className="btn-primary text-xs px-4 py-2 rounded-lg self-end flex-shrink-0"
                                    >
                                      {isCmdLoading ? 'Planning…' : 'Plan'}
                                    </button>
                                  </div>
                                )}

                                {cmdError && (
                                  <p className="text-xs mt-2 mb-2" style={{ color: '#fca5a5' }}>{cmdError}</p>
                                )}

                                {plan && (
                                  <div className="space-y-3">
                                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{plan.summary}</p>
                                    <div className="space-y-1.5">
                                      {plan.steps.map(step => (
                                        <div key={step.order} className="flex items-center gap-3 py-1.5 px-3 rounded-lg text-xs"
                                          style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)' }}>
                                          <span className="w-4 h-4 rounded text-center font-bold flex-shrink-0"
                                            style={{ background: 'rgba(139,92,246,0.2)', color: '#a78bfa', fontSize: '10px', lineHeight: '16px' }}>
                                            {step.order}
                                          </span>
                                          <span className="font-mono flex-shrink-0" style={{ color: 'var(--accent)' }}>
                                            {step.tool.replace(/^agentos\./, '')}
                                          </span>
                                          <span className="flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>{step.description}</span>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="flex gap-2 pt-1">
                                      <button
                                        onClick={() => void confirmAgentCommand(agent.agent_id, plan.confirmToken)}
                                        disabled={isCmdLoading}
                                        className="btn-primary text-xs px-4 py-1.5 rounded-lg"
                                      >
                                        {isCmdLoading ? 'Running…' : 'Confirm & Run'}
                                      </button>
                                      <button
                                        onClick={() => { setCommandPlan(prev => ({ ...prev, [agent.agent_id]: null })); setCommandError(prev => ({ ...prev, [agent.agent_id]: null })); }}
                                        className="btn-outline text-xs px-3 py-1.5 rounded-lg"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {cmdResult && (
                                  <div className="space-y-2">
                                    <p className="text-xs font-semibold" style={{ color: '#86efac' }}>Executed {cmdResult.results.length} step{cmdResult.results.length !== 1 ? 's' : ''}</p>
                                    <div className="space-y-1">
                                      {cmdResult.results.map((r, i) => (
                                        <div key={i} className="flex items-center gap-3 py-1.5 px-3 rounded-lg text-xs"
                                          style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)' }}>
                                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                                          <span className="font-mono flex-shrink-0" style={{ color: 'var(--accent)' }}>{r.tool}</span>
                                          <span className="text-xs truncate flex-1" style={{ color: 'var(--text-muted)' }}>
                                            {typeof r.result === 'object' ? JSON.stringify(r.result).slice(0, 80) : String(r.result)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                    <button
                                      onClick={() => { setCommandResults(prev => ({ ...prev, [agent.agent_id]: null })); setCommandDraft(prev => ({ ...prev, [agent.agent_id]: '' })); }}
                                      className="text-xs mt-1"
                                      style={{ color: 'var(--text-muted)' }}
                                    >
                                      New command
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Activity Panel */}
                          {panel === 'activity' && (
                            <div style={{ borderTop: '1px solid var(--border)', background: 'rgba(0,0,0,0.3)' }}>
                              <div className="px-5 py-3 flex items-center justify-between">
                                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                                  Activity Log
                                </span>
                                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Last 50 operations</span>
                              </div>
                              {activity.length === 0 ? (
                                <div className="px-5 pb-5 text-center">
                                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No operations recorded yet for this agent.</p>
                                </div>
                              ) : (
                                <div className="px-5 pb-5 space-y-1.5">
                                  {activity.map((entry, i) => (
                                    <div key={i} className="flex items-center gap-3 py-1.5 px-3 rounded-lg text-xs"
                                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${entry.success ? 'bg-green-400' : 'bg-red-400'}`} />
                                      <span className="font-mono font-semibold w-12 flex-shrink-0" style={{ color: 'var(--accent)' }}>
                                        {entry.primitive}
                                      </span>
                                      <span className="font-mono flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                                        {entry.operation}
                                      </span>
                                      {entry.duration_ms != null && (
                                        <span style={{ color: 'var(--text-dim)' }}>{entry.duration_ms}ms</span>
                                      )}
                                      {entry.error && (
                                        <span className="truncate max-w-32" style={{ color: '#fca5a5' }}>{entry.error}</span>
                                      )}
                                      <span className="hidden sm:block flex-shrink-0" style={{ color: 'var(--text-dim)' }}>
                                        {new Date(entry.created_at).toLocaleTimeString()}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'activity' && (
              <div>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="font-black text-lg">Recent Activity</h2>
                  <button onClick={() => void loadActivity()} className="btn-outline text-xs px-3 py-1.5 rounded-lg">
                    {activityTabLoading ? 'Loading…' : 'Refresh'}
                  </button>
                </div>

                {activityTabLoading && recentAudit.length === 0 ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => <div key={i} className="card h-14 animate-pulse" />)}
                  </div>
                ) : recentAudit.length === 0 ? (
                  <div className="card p-12 text-center">
                    <div className="w-14 h-14 mx-auto mb-4" style={{ background: 'var(--accent-glow)', border: '1px solid var(--border-active)' }} />
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

function CredRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 font-mono text-xs px-3 py-2.5 rounded-lg truncate"
          style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-bright)', color: '#a78bfa' }}>
          {value}
        </div>
        <button onClick={copy}
          className="text-xs px-3 py-2.5 rounded-lg transition-all"
          style={copied
            ? { background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#86efac' }
            : { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-bright)', color: 'var(--text-muted)' }}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

