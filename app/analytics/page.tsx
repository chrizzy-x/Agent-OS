'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';

type AnalyticsPayload = {
  summary?: {
    totalRevenueUsd?: number;
    activeInstalls?: number;
    activePublishers?: number;
    payoutsQueued?: number;
  };
};

export default function AnalyticsPage() {
  const router = useRouter();
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
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
      try {
        const res = await fetch('/api/developer/analytics', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (active) setAnalytics(data);
        }
      } catch {
        // non-fatal for retail plans
      } finally {
        if (active) setLoading(false);
      }
    }
    void bootstrap();
    return () => { active = false; };
  }, [router]);

  if (loading) return <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }} />;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Nav activePath="/analytics" />
      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px 80px' }}>
        <div style={{ marginBottom: '18px' }}>
          <div style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.08em' }}>
            Analytics
          </div>
          <h1 style={{ margin: '8px 0', color: 'var(--text-primary)' }}>Workspace activity</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
            Studio events, workflow runs, installs, and publishing performance.
          </p>
        </div>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '10px' }}>
          <div className="card" style={{ padding: '16px' }}>
            <div style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase' }}>Plan</div>
            <div style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '8px' }}>{session?.planLabel ?? 'Retail Free'}</div>
          </div>
          <div className="card" style={{ padding: '16px' }}>
            <div style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase' }}>Active installs</div>
            <div style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '8px' }}>{analytics?.summary?.activeInstalls ?? '—'}</div>
          </div>
          <div className="card" style={{ padding: '16px' }}>
            <div style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase' }}>Publishers</div>
            <div style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '8px' }}>{analytics?.summary?.activePublishers ?? '—'}</div>
          </div>
          <div className="card" style={{ padding: '16px' }}>
            <div style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase' }}>Revenue (USD)</div>
            <div style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '8px' }}>{analytics?.summary?.totalRevenueUsd ?? '—'}</div>
          </div>
        </section>
      </main>
    </div>
  );
}
