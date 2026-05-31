'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';

const PLAN_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'retail_free', label: 'Retail Free' },
  { value: 'retail_pro', label: 'Retail Pro' },
  { value: 'enterprise_plus', label: 'Enterprise Plus' },
  { value: 'enterprise_max', label: 'Enterprise Max' },
];

export default function BillingPage() {
  const router = useRouter();
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [targetPlan, setTargetPlan] = useState('retail_pro');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

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
      setTargetPlan(current.plan === 'retail_free' ? 'retail_pro' : 'enterprise_plus');
      setLoading(false);
    }
    void bootstrap();
    return () => { active = false; };
  }, [router]);

  const currentPlan = useMemo(() => session?.plan ?? 'retail_free', [session?.plan]);

  async function transitionPlan() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/plans/transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPlan,
          newPlan: targetPlan,
          reason: 'user_requested_transition',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.message ?? data.error ?? 'Failed to change plan');
        return;
      }
      setMessage(`Plan updated to ${data.transition?.newPlan ?? targetPlan}. Capability changes are now enforced server-side.`);
      const refreshed = await fetchBrowserSession();
      setSession(refreshed);
    } catch {
      setMessage('Failed to change plan');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }} />;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Nav activePath="/billing" />
      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px 80px' }}>
        <div style={{ marginBottom: '18px' }}>
          <div style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.08em' }}>
            Billing & plans
          </div>
          <h1 style={{ margin: '8px 0', color: 'var(--text-primary)' }}>Plan transitions</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
            Upgrades and downgrades preserve data and recompute capabilities.
          </p>
        </div>

        <section className="card" style={{ padding: '18px' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '10px' }}>
            Current plan: <strong style={{ color: 'var(--text-primary)' }}>{session?.planLabel ?? currentPlan}</strong>
          </div>
          <select className="input-dark" value={targetPlan} onChange={event => setTargetPlan(event.target.value)}>
            {PLAN_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <div style={{ marginTop: '12px' }}>
            <button type="button" className="btn-primary" onClick={() => void transitionPlan()} disabled={busy}>
              {busy ? 'Updating...' : 'Change plan'}
            </button>
          </div>
          {message && <p style={{ margin: '12px 0 0', color: message.toLowerCase().includes('failed') || message.toLowerCase().includes('invalid') ? '#fca5a5' : '#86efac' }}>{message}</p>}
        </section>
      </main>
    </div>
  );
}
