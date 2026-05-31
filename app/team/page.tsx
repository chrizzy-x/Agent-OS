'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';

export default function TeamPage() {
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

  const enterprise = session?.capabilities?.includes('manage_team') === true;
  if (!enterprise) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
        <Nav />
        <main style={{ maxWidth: '780px', margin: '0 auto', padding: '48px 24px' }}>
          <h1 style={{ color: 'var(--text-primary)', margin: '0 0 10px' }}>Team management requires Enterprise</h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
            Team and organization management are available on Enterprise Plus and Enterprise Max plans.
          </p>
          <Link href="/workspace" className="btn-primary" style={{ marginTop: '18px' }}>Open Workspace</Link>
        </main>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Nav activePath="/team" />
      <main style={{ maxWidth: '980px', margin: '0 auto', padding: '32px 24px 80px' }}>
        <div style={{ marginBottom: '18px' }}>
          <div style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.08em' }}>
            Team management
          </div>
          <h1 style={{ margin: '8px 0', color: 'var(--text-primary)' }}>Organization controls</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
            Manage members, roles, and workspace governance for enterprise workspaces.
          </p>
        </div>

        <section className="card" style={{ padding: '18px' }}>
          <div style={{ color: 'var(--text-primary)', marginBottom: '8px', fontSize: '16px' }}>Workspace members and audit logs</div>
          <div style={{ color: 'var(--text-secondary)', marginBottom: '12px', fontSize: '13px' }}>
            Use Workspace controls to add members, update roles, and review audit trails.
          </div>
          <Link href="/workspaces" className="btn-primary">Open Workspaces</Link>
        </section>
      </main>
    </div>
  );
}
