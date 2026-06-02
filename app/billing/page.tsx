'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';

export default function BillingPage() {
  const router = useRouter();
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [loading, setLoading] = useState(true);

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

  const nextAction = useMemo(() => {
    if (!session) return 'Request access';
    if ((session.plan ?? '').startsWith('enterprise')) return 'Contact sales';
    return 'Request upgrade';
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
            Capability gating stays enforced by plan. Self-serve checkout is disabled until real billing is live.
          </p>
        </div>

        <section className="card" style={{ padding: '18px', marginBottom: '16px' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '10px' }}>
            Current plan: <strong style={{ color: 'var(--text-primary)' }}>{session?.planLabel ?? session?.plan ?? 'Unknown'}</strong>
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '16px' }}>
            Active capabilities: {(session?.capabilities ?? []).slice(0, 8).join(', ') || 'None'}
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <a
              href={`mailto:sales@agentos.app?subject=${encodeURIComponent(`AgentOS ${nextAction.toLowerCase()}`)}`}
              className="btn-primary"
            >
              {nextAction}
            </a>
            <a
              href="mailto:sales@agentos.app?subject=AgentOS enterprise rollout"
              className="btn-outline"
            >
              Contact sales
            </a>
          </div>
        </section>

        <section className="card" style={{ padding: '18px' }}>
          <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '10px' }}>What happens next</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.7 }}>
            Access requests are handled outside checkout for now. Production workspaces keep their current plan until AgentOS billing is implemented and verified end to end.
          </div>
        </section>
      </main>
    </div>
  );
}
