'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';

export default function WorkspacePage() {
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

  if (loading) return <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }} />;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Nav activePath="/workspace" />
      <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '32px 24px 80px' }}>
        <div style={{ marginBottom: '18px' }}>
          <div style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.08em' }}>
            Workspace
          </div>
          <h1 style={{ margin: '8px 0', color: 'var(--text-primary)' }}>Workspace controls</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
            Manage projects, members, audit trail, and vault ownership from one place.
          </p>
        </div>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '10px' }}>
          <Link href="/workspaces" className="card" style={{ padding: '16px', textDecoration: 'none' }}>
            <div style={{ color: 'var(--text-primary)', fontSize: '16px', marginBottom: '6px' }}>Projects</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Open workspace list, members, agents, and audit logs.</div>
          </Link>
          <Link href="/vault" className="card" style={{ padding: '16px', textDecoration: 'none' }}>
            <div style={{ color: 'var(--text-primary)', fontSize: '16px', marginBottom: '6px' }}>Vault</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Manage workspace secrets, assignments, and access history.</div>
          </Link>
          <Link href="/billing" className="card" style={{ padding: '16px', textDecoration: 'none' }}>
            <div style={{ color: 'var(--text-primary)', fontSize: '16px', marginBottom: '6px' }}>Billing & plans</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Upgrade or downgrade plans with server-side capability enforcement.</div>
          </Link>
          {session?.capabilities?.includes('access_developer_console') ? (
            <Link href="/team" className="card" style={{ padding: '16px', textDecoration: 'none' }}>
              <div style={{ color: 'var(--text-primary)', fontSize: '16px', marginBottom: '6px' }}>Team management</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Enterprise controls for team members and org workspaces.</div>
            </Link>
          ) : (
            <div className="card" style={{ padding: '16px' }}>
              <div style={{ color: 'var(--text-primary)', fontSize: '16px', marginBottom: '6px' }}>Team management</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Enterprise Plus/Max only.</div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
