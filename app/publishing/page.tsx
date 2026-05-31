'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';

export default function PublishingPage() {
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

  const enterprise = session?.capabilities?.includes('access_developer_console') === true;
  if (!enterprise) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
        <Nav />
        <main style={{ maxWidth: '780px', margin: '0 auto', padding: '48px 24px' }}>
          <h1 style={{ color: 'var(--text-primary)', margin: '0 0 10px' }}>Publishing requires Enterprise</h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
            App/Skill creation and SDK access require Enterprise Plus or Enterprise Max.
          </p>
          <Link href="/studio?upgrade=enterprise" className="btn-primary" style={{ marginTop: '18px' }}>Open Studio</Link>
        </main>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Nav activePath="/publishing" />
      <main style={{ maxWidth: '980px', margin: '0 auto', padding: '32px 24px 80px' }}>
        <div style={{ marginBottom: '18px' }}>
          <div style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.08em' }}>
            Publishing
          </div>
          <h1 style={{ margin: '8px 0', color: 'var(--text-primary)' }}>App and Skill submissions</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
            Use Developer Console to create manifests, versions, and publish submissions.
          </p>
        </div>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: '10px' }}>
          <Link href="/developer" className="card" style={{ padding: '16px', textDecoration: 'none' }}>
            <div style={{ color: 'var(--text-primary)', fontSize: '16px', marginBottom: '6px' }}>Developer Console</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Create and publish Apps/Skills with review states.</div>
          </Link>
          <Link href="/docs/sdk" className="card" style={{ padding: '16px', textDecoration: 'none' }}>
            <div style={{ color: 'var(--text-primary)', fontSize: '16px', marginBottom: '6px' }}>SDK manager</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Manage SDK credentials, manifests, and webhook integrations.</div>
          </Link>
        </section>
      </main>
    </div>
  );
}
