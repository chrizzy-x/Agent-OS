'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import {
  fetchBrowserSession,
  issueBrowserToken,
  type BrowserSession,
  type BrowserTokenCredentials,
} from '@/src/auth/browser-session';

export default function SettingsPage() {
  const router = useRouter();
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [token, setToken] = useState<BrowserTokenCredentials | null>(null);
  const [loading, setLoading] = useState(true);
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
      setLoading(false);
    }
    void bootstrap();
    return () => { active = false; };
  }, [router]);

  async function generateToken() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const credentials = await issueBrowserToken();
      setToken(credentials);
      setMessage('Bearer token generated. Save it now.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to issue token');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }} />;

  const canUseBearer = session?.capabilities?.includes('use_bearer_token') === true;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Nav activePath="/settings" />
      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px 80px' }}>
        <div style={{ marginBottom: '18px' }}>
          <div style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.08em' }}>
            Settings
          </div>
          <h1 style={{ margin: '8px 0', color: 'var(--text-primary)' }}>Account settings</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
            Manage session credentials, capability access, and plan-scoped settings.
          </p>
        </div>

        <section className="card" style={{ padding: '18px', marginBottom: '12px' }}>
          <div style={{ color: 'var(--text-primary)', fontSize: '16px', marginBottom: '6px' }}>Plan</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{session?.planLabel ?? 'Retail Free'}</div>
        </section>

        <section className="card" style={{ padding: '18px' }}>
          <div style={{ color: 'var(--text-primary)', fontSize: '16px', marginBottom: '6px' }}>Bearer token</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '12px' }}>
            {canUseBearer
              ? 'Create a scoped bearer token for API access. This does not grant SDK access.'
              : 'Bearer token access is not enabled for this plan.'}
          </div>
          <button type="button" className="btn-primary" disabled={!canUseBearer || busy} onClick={() => void generateToken()}>
            {busy ? 'Generating...' : 'Generate token'}
          </button>
          {message && <p style={{ margin: '12px 0 0', color: message.toLowerCase().includes('failed') ? '#fca5a5' : '#86efac' }}>{message}</p>}
          {token && (
            <pre className="terminal" style={{ marginTop: '12px', padding: '12px', color: 'var(--text-secondary)' }}>
{JSON.stringify(token, null, 2)}
            </pre>
          )}
        </section>
      </main>
    </div>
  );
}
