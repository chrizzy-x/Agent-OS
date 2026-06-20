'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import { getUpgradeablePlans, PLAN_LABELS, type AgentPlan } from '@/src/auth/tiers';

const PLAN_CARDS: Array<{ plan: AgentPlan; summary: string; note: string }> = [
  { plan: 'retail_free', summary: 'Core Super AgentOS, workspace installs, workflows, subagents, and Vault.', note: 'Browser session access.' },
  { plan: 'retail_pro', summary: 'Free plus bearer tokens, higher limits, and API access.', note: 'Best for API and CLI use.' },
  { plan: 'enterprise_plus', summary: 'Pro plus SDK, developer console, publishing, MCP, and team controls.', note: 'Best for builders and teams.' },
  { plan: 'enterprise_max', summary: 'Enterprise plus highest limits, governance, and diagnostics.', note: 'Highest plan.' },
];

export default function BillingPage() {
  const router = useRouter();
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingPlan, setPendingPlan] = useState<AgentPlan | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      setLoading(false);
    }
    void bootstrap();
    return () => { active = false; };
  }, [router]);

  const currentPlan = useMemo(() => (
    session?.plan && session.plan in PLAN_LABELS ? session.plan as AgentPlan : null
  ), [session?.plan]);

  const upgradeablePlans = useMemo(() => {
    if (!currentPlan) return new Set<AgentPlan>();
    return new Set(getUpgradeablePlans(currentPlan));
  }, [currentPlan]);

  async function handleUpgrade(newPlan: AgentPlan) {
    setPendingPlan(newPlan);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch('/api/plans/transition', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPlan }),
      });
      const payload = await response.json().catch(() => ({})) as {
        message?: string;
        noChange?: boolean;
        transition?: { newCapabilities?: string[] };
      };

      if (!response.ok) {
        throw new Error(payload.message || 'Failed to change plan.');
      }

      setSession(current => current ? {
        ...current,
        plan: newPlan,
        planLabel: PLAN_LABELS[newPlan],
        accountType: newPlan.startsWith('enterprise') ? 'enterprise' : 'retail',
        capabilities: Array.isArray(payload.transition?.newCapabilities) ? payload.transition.newCapabilities : current.capabilities,
      } : current);
      setMessage(payload.noChange ? `${PLAN_LABELS[newPlan]} is already active.` : `${PLAN_LABELS[newPlan]} is now active. Free beta mode applied with no charge.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change plan.');
    } finally {
      setPendingPlan(null);
    }
  }

  const capabilityPreview = useMemo(() => {
    if (!session?.capabilities?.length) return 'None';
    return session.capabilities.slice(0, 10).join(', ');
  }, [session]);

  if (loading) return <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }} />;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Nav activePath="/billing" />
      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px 80px' }}>
        <div style={{ marginBottom: '18px' }}>
          <div style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.08em' }}>
            Billing & plans
          </div>
          <h1 style={{ margin: '8px 0', color: 'var(--text-primary)' }}>Plan access</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
            Capability gating stays enforced by plan. Beta upgrades are live and apply immediately with no charge.
          </p>
        </div>

        <section className="card" style={{ padding: '18px', marginBottom: '16px' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '10px' }}>
            Current plan: <strong style={{ color: 'var(--text-primary)' }}>{session?.planLabel ?? session?.plan ?? 'Unknown'}</strong>
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '16px' }}>
            Active capabilities: {capabilityPreview}
          </div>
          {message ? (
            <div style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.08)', color: '#bbf7d0', fontSize: 13 }}>
              {message}
            </div>
          ) : null}
          {error ? (
            <div style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.08)', color: '#fecaca', fontSize: 13 }}>
              {error}
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <a
              href="mailto:sales@agentos.app?subject=AgentOS enterprise rollout"
              className="btn-primary"
            >
              Contact sales
            </a>
          </div>
          <div style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>
            All public beta plans are currently priced at $0. Changes are recorded in audit history and update the primary workspace plan immediately.
          </div>
        </section>

        <section className="card" style={{ padding: '18px' }}>
          <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '14px' }}>Available beta plans</div>
          <div style={{ display: 'grid', gap: '12px' }}>
            {PLAN_CARDS.map(card => {
              const isCurrent = currentPlan === card.plan;
              const canUpgrade = upgradeablePlans.has(card.plan);
              return (
                <div
                  key={card.plan}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 16,
                    padding: '16px',
                    background: isCurrent ? 'rgba(139, 92, 246, 0.08)' : 'rgba(255,255,255,0.01)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '6px' }}>{PLAN_LABELS[card.plan]}</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '4px' }}>{card.summary}</div>
                      <div style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>{card.note}</div>
                    </div>
                    {isCurrent ? (
                      <span style={{ color: '#ddd6fe', background: 'rgba(139, 92, 246, 0.16)', border: '1px solid rgba(139, 92, 246, 0.28)', borderRadius: 999, padding: '6px 10px', fontSize: 12, fontWeight: 600 }}>
                        Active
                      </span>
                    ) : canUpgrade ? (
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => void handleUpgrade(card.plan)}
                        disabled={pendingPlan !== null}
                        style={{ opacity: pendingPlan !== null ? 0.7 : 1 }}
                      >
                        {pendingPlan === card.plan ? 'Upgrading...' : `Upgrade to ${PLAN_LABELS[card.plan]}`}
                      </button>
                    ) : (
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Unavailable from current plan</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
