'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { fetchBrowserSession } from '@/src/auth/browser-session';

const LINK_ERRORS: Record<string, string> = {
  invalid_link: 'This login link is invalid.',
  link_expired: 'This login link has expired. Generate a new one from your SDK.',
  server_error: 'Something went wrong. Please sign in manually or try again.',
};

function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(() => {
    const code = searchParams.get('error');
    return code ? (LINK_ERRORS[code] ?? 'Login link failed. Please sign in manually.') : '';
  });

  useEffect(() => {
    let active = true;
    void fetchBrowserSession().then(session => {
      if (active && session) router.replace('/dashboard');
    });
    return () => { active = false; };
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }
      router.push('/dashboard');
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'var(--bg-primary)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
    }}>
      {/* Logo */}
      <Link href="/" style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        textDecoration: 'none',
        marginBottom: '40px',
      }}>
        <div style={{
          width: '28px',
          height: '28px',
          border: '1px solid var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
          fontWeight: 700,
          fontSize: '14px',
          color: 'var(--accent)',
        }}>A</div>
        <span style={{
          fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
          fontWeight: 600,
          fontSize: '15px',
          color: 'var(--text-primary)',
        }}>AgentOS</span>
      </Link>

      {/* Card */}
      <div style={{
        width: '100%',
        maxWidth: '400px',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        padding: '32px',
      }}>
        <h1 style={{
          fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
          fontSize: '22px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: '6px',
          marginTop: 0,
        }}>Welcome back</h1>
        <p style={{
          fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
          fontSize: '14px',
          color: 'var(--text-secondary)',
          marginBottom: '28px',
          marginTop: 0,
        }}>Sign in to your agent account.</p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label htmlFor="email" style={{
              display: 'block',
              fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              marginBottom: '6px',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}>Email</label>
            <input
              id="email"
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="input-dark"
            />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label htmlFor="password" style={{
                fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}>Password</label>
              <Link href="/forgot-password" style={{
                fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
                fontSize: '12px',
                color: 'var(--accent)',
                textDecoration: 'none',
              }}>Forgot password?</Link>
            </div>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Your password"
              className="input-dark"
            />
          </div>

          {error && (
            <div style={{
              padding: '12px 16px',
              background: 'rgba(255,68,68,0.08)',
              border: '1px solid rgba(255,68,68,0.3)',
              color: 'var(--danger)',
              fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
              fontSize: '13px',
            }}>
              {error}
              {error.includes('sign up') && (
                <span> <Link href="/signup" style={{ color: 'var(--text-primary)', textDecoration: 'underline' }}>Create account</Link></span>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="btn-primary"
            style={{
              width: '100%',
              justifyContent: 'center',
              opacity: (loading || !email || !password) ? 0.5 : 1,
              cursor: (loading || !email || !password) ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                <svg style={{ animation: 'spin 1s linear infinite' }} width="14" height="14" fill="none" viewBox="0 0 24 24">
                  <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Signing in...
              </span>
            ) : 'Sign in'}
          </button>
        </form>

        <div style={{
          borderTop: '1px solid var(--border)',
          marginTop: '24px',
          paddingTop: '24px',
          textAlign: 'center',
          fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
          fontSize: '13px',
          color: 'var(--text-secondary)',
        }}>
          No account?{' '}
          <Link href="/signup" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
            Sign up free
          </Link>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)' }} />}>
      <SignInContent />
    </Suspense>
  );
}
