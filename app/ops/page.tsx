'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';

type CrewPair = {
  status: string;
  infra_agent?: { name?: string; status?: string } | null;
} | null;

type CrewHealth = {
  status: string;
  health_score: number;
  summary?: string;
} | null;

type CrewTask = {
  id: string;
  task_type: string;
  status: string;
};

type CrewItem = {
  feature: {
    slug: string;
    id: number;
    name: string;
    kind: string;
    categoryName: string;
    categoryBadge: string;
    short: string;
  };
  activePair: CrewPair;
  standbyPair: CrewPair;
  activeHealth: CrewHealth;
  standbyHealth: CrewHealth;
  openTasks?: CrewTask[];
  openTaskCount?: number;
  coverageState: string;
};

type CrewResponse = {
  summary: { platformFeatures: number; runtimeFunctions: number; totalCatalogItems: number };
  settings: { operation_mode: 'single_agent' | 'multi_agent'; consensus_mode_enabled: boolean };
  coverage?: {
    totalCatalogItems: number;
    fullyCovered: number;
    degradedCoverage: number;
    uncovered: number;
  };
  protectedSummary?: string;
  items?: CrewItem[];
  failoverEvents?: { id: string; feature_slug: string; reason: string; created_at: string }[];
  requiresAuthForDetails?: boolean;
};

type MetricsResponse = {
  metrics: {
    totalCatalogItems: number;
    fullyCovered: number;
    coveragePercent: number;
    healthyActiveAgents: number;
    degradedActiveAgents: number;
    openTasks: number;
    failoverEvents: number;
  };
  requiresAuthForDetails?: boolean;
};

type SettingsResponse = {
  settings: { operation_mode: 'single_agent' | 'multi_agent'; consensus_mode_enabled: boolean };
  ffpEnabled: boolean;
};

export default function OpsPage() {
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [crew, setCrew] = useState<CrewResponse | null>(null);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');

  async function loadAll() {
    setLoading(true);
    try {
      const [crewRes, metricsRes, settingsRes] = await Promise.all([
        fetch('/api/ops/crew', { cache: 'no-store' }),
        fetch('/api/ops/metrics', { cache: 'no-store' }),
        fetch('/api/ops/settings', { cache: 'no-store' }),
      ]);

      const [crewData, metricsData, settingsData] = await Promise.all([
        crewRes.json(),
        metricsRes.json(),
        settingsRes.json(),
      ]);

      setCrew(crewData);
      setMetrics(metricsData);
      setSettings(settingsData);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const currentSession = await fetchBrowserSession();
      if (!active) return;
      setSession(currentSession);
      await loadAll();
    }

    void bootstrap();
    return () => { active = false; };
  }, []);

  async function saveSettings(next: { operationMode?: 'single_agent' | 'multi_agent'; consensusModeEnabled?: boolean }) {
    if (!session) {
      setMessage('Sign in first to update ops settings.');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/ops/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(next),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update settings');
      }
      setSettings({ settings: data.settings, ffpEnabled: data.ffpEnabled });
      setMessage('Ops settings updated.');
      await loadAll();
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  }

  async function runAction(path: string, body?: Record<string, unknown>) {
    if (!session) {
      setMessage('Sign in first to run ops actions.');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body ?? {}),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Action failed');
      }
      setMessage('Action completed.');
      await loadAll();
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'Action failed');
    } finally {
      setSaving(false);
    }
  }

  const filteredItems = (crew?.items ?? []).filter(item => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return true;
    }
    return (
      item.feature.name.toLowerCase().includes(term) ||
      item.feature.slug.toLowerCase().includes(term) ||
      item.feature.categoryName.toLowerCase().includes(term)
    );
  });

  const operationMode = settings?.settings.operation_mode ?? 'single_agent';
  const consensusEnabled = settings?.settings.consensus_mode_enabled ?? false;
  const ffpEnabled = settings?.ffpEnabled ?? false;
  const canToggleConsensus = operationMode === 'multi_agent' && ffpEnabled;
  const signedOutDetails = crew?.requiresAuthForDetails && !session;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <nav className="sticky top-0 z-40 backdrop-blur-md" style={{ background: 'rgba(10,10,20,0.85)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center font-black font-mono text-xs"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', boxShadow: '0 0 12px rgba(124,58,237,0.4)' }}>
              A
            </div>
            <span className="font-mono font-bold text-sm">Agent<span className="gradient-text">OS</span></span>
          </Link>
          <div className="flex items-center gap-5 text-sm">
            <Link href="/dashboard" className="transition-colors hover:text-white" style={{ color: 'var(--text-muted)' }}>Dashboard</Link>
            <Link href="/docs/features" className="transition-colors hover:text-white" style={{ color: 'var(--text-muted)' }}>Feature Catalog</Link>
            <button onClick={() => void loadAll()} className="btn-outline text-xs px-4 py-2">Refresh</button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-10 space-y-8">
        <section className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div>
            <div className="badge badge-purple mb-4">Autonomous Infrastructure Crew</div>
            <h1 className="text-4xl font-black mb-3">Active and standby coverage for every feature and function</h1>
            <p className="text-base max-w-4xl" style={{ color: 'var(--text-muted)' }}>
              The ops console confirms pair coverage, health snapshots, failovers, and queued work for every platform feature and runtime function.
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <button onClick={() => void runAction('/api/ops/crew/bootstrap')} className="btn-outline text-sm px-4 py-2" disabled={saving || !session}>Bootstrap Coverage</button>
            <button onClick={() => void runAction('/api/ops/crew/cron')} className="btn-primary text-sm px-4 py-2" disabled={saving || !session}>Run Cron Cycle</button>
          </div>
        </section>

        {message && (
          <div className="card p-4 text-sm" style={{ color: 'var(--text-muted)' }}>{message}</div>
        )}

        {signedOutDetails && (
          <div className="card p-4 text-sm" style={{ color: 'var(--text-muted)' }}>
            Signed-out view hides the per-item infrastructure matrix and incident history. Sign in to open a secure browser session, then use your ops-admin access to inspect and operate the full control plane.
          </div>
        )}

        <section className="grid md:grid-cols-4 gap-4">
          {[
            { label: 'Catalog items', value: metrics?.metrics.totalCatalogItems ?? 0 },
            { label: 'Fully covered', value: metrics?.metrics.fullyCovered ?? 0 },
            { label: 'Coverage %', value: `${metrics?.metrics.coveragePercent ?? 0}%` },
            { label: 'Open tasks', value: metrics?.metrics.openTasks ?? 0 },
          ].map(card => (
            <div key={card.label} className="card p-5">
              <div className="text-3xl font-black gradient-text mb-1">{card.value}</div>
              <div className="text-sm" style={{ color: 'var(--text-muted)' }}>{card.label}</div>
            </div>
          ))}
        </section>

        {signedOutDetails && crew?.coverage && (
          <section className="grid md:grid-cols-3 gap-4">
            <div className="card p-5">
              <div className="text-2xl font-black gradient-text mb-1">{crew.coverage.fullyCovered}</div>
              <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Fully covered items</div>
            </div>
            <div className="card p-5">
              <div className="text-2xl font-black gradient-text mb-1">{crew.coverage.degradedCoverage}</div>
              <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Degraded coverage items</div>
            </div>
            <div className="card p-5">
              <div className="text-2xl font-black gradient-text mb-1">{crew.coverage.uncovered}</div>
              <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Uncovered items</div>
            </div>
          </section>
        )}

        <section className="grid xl:grid-cols-[1.1fr,2fr] gap-4">
          <div className="card p-6">
            <h2 className="text-xl font-bold mb-4">Run Mode</h2>
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => void saveSettings({ operationMode: 'single_agent', consensusModeEnabled: false })}
                disabled={saving || !session}
                className="btn-outline text-sm px-4 py-2"
                style={operationMode === 'single_agent' ? { borderColor: '#a855f7', color: '#a855f7' } : undefined}
              >
                Single-agent
              </button>
              <button
                onClick={() => void saveSettings({ operationMode: 'multi_agent' })}
                disabled={saving || !session}
                className="btn-outline text-sm px-4 py-2"
                style={operationMode === 'multi_agent' ? { borderColor: '#a855f7', color: '#a855f7' } : undefined}
              >
                Multi-agent
              </button>
            </div>
            <div className="rounded-xl p-4 mb-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between gap-3 mb-2">
                <div>
                  <div className="font-semibold">FFP / Consensus Mode</div>
                  <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Only available when the workflow is multi-agent and deployment FFP mode is enabled.
                  </div>
                </div>
                <button
                  onClick={() => void saveSettings({ consensusModeEnabled: !consensusEnabled })}
                  disabled={!canToggleConsensus || saving || !session}
                  className="btn-primary text-sm px-4 py-2"
                  style={!canToggleConsensus || !session ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                >
                  {consensusEnabled ? 'Consensus On' : 'Consensus Off'}
                </button>
              </div>
              <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
                Deployment FFP mode: {ffpEnabled ? 'enabled' : 'disabled'}
              </div>
            </div>
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {operationMode === 'multi_agent'
                ? 'Multi-agent workflows can use consensus-aware execution and failover controls.'
                : 'Switch to multi-agent mode to enable the consensus button.'}
            </div>
          </div>

          <div className="card p-6">
            <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
              <div>
                <h2 className="text-xl font-bold">Coverage Matrix</h2>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {signedOutDetails
                    ? crew?.protectedSummary ?? 'Sign in to inspect the per-item active and standby matrix.'
                    : 'Every item should always keep one active agent and one standby agent assigned.'}
                </p>
              </div>
              <input
                type="text"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search features or functions"
                className="input-dark"
                style={{ width: '280px' }}
                disabled={signedOutDetails}
              />
            </div>

            {loading ? (
              <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading operations data...</div>
            ) : signedOutDetails ? (
              <div className="rounded-xl p-5 text-sm" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                The public ops surface intentionally stops at aggregate coverage and health. Sign in with ops-admin access to inspect feature-by-feature assignments, live queue details, and force failover actions.
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="text-sm" style={{ color: 'var(--text-muted)' }}>No features or runtime functions match your search.</div>
            ) : (
              <div className="space-y-3 max-h-[900px] overflow-y-auto pr-1">
                {filteredItems.map(item => {
                  const openTaskCount = item.openTaskCount ?? item.openTasks?.length ?? 0;

                  return (
                    <article key={item.feature.slug} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                      <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="badge badge-purple text-xs">{item.feature.categoryBadge}</span>
                            <span className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>#{item.feature.id}</span>
                            <span className="text-xs uppercase" style={{ color: 'var(--text-dim)' }}>{item.feature.kind.replace('_', ' ')}</span>
                          </div>
                          <h3 className="font-semibold text-lg">{item.feature.name}</h3>
                          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{item.feature.short}</p>
                        </div>
                        <button
                          onClick={() => void runAction('/api/ops/crew/failover', { featureSlug: item.feature.slug })}
                          className="btn-outline text-xs px-3 py-2"
                          disabled={saving || !session}
                        >
                          Force failover
                        </button>
                      </div>

                      <div className="grid lg:grid-cols-3 gap-3 text-sm">
                        <div className="rounded-lg p-3" style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.15)' }}>
                          <div className="font-semibold mb-1">Active agent</div>
                          <div>{item.activePair?.infra_agent?.name ?? 'Missing'}</div>
                          <div style={{ color: 'var(--text-muted)' }}>Status: {item.activeHealth?.status ?? item.activePair?.status ?? 'unknown'}</div>
                          <div style={{ color: 'var(--text-muted)' }}>Score: {item.activeHealth?.health_score ?? 'n/a'}</div>
                        </div>
                        <div className="rounded-lg p-3" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
                          <div className="font-semibold mb-1">Standby agent</div>
                          <div>{item.standbyPair?.infra_agent?.name ?? 'Missing'}</div>
                          <div style={{ color: 'var(--text-muted)' }}>Status: {item.standbyHealth?.status ?? item.standbyPair?.status ?? 'unknown'}</div>
                          <div style={{ color: 'var(--text-muted)' }}>Score: {item.standbyHealth?.health_score ?? 'n/a'}</div>
                        </div>
                        <div className="rounded-lg p-3" style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.15)' }}>
                          <div className="font-semibold mb-1">Queue and coverage</div>
                          <div>Coverage: {item.coverageState}</div>
                          <div style={{ color: 'var(--text-muted)' }}>Open tasks: {openTaskCount}</div>
                          <div style={{ color: 'var(--text-muted)' }}>Category: {item.feature.categoryName}</div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
