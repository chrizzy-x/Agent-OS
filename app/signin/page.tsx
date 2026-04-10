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
      if (active && session) {
        router.replace('/dashboard');
      }
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
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      <div className="hidden lg:flex flex-col justify-between w-[440px] flex-shrink-0 relative overflow-hidden p-10 bg-grid"
        style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}>
        <div className="absolute top-[-80px] left-[-80px] w-72 h-72 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.2) 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div className="absolute bottom-[-40px] right-[-40px] w-56 h-56 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 70%)', filter: 'blur(60px)' }} />

        <Link href="/" className="relative flex items-center gap-2.5 w-fit">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black font-mono text-sm"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', boxShadow: '0 0 16px rgba(124,58,237,0.5)' }}>
            A
          </div>
          <span className="font-mono font-bold">Agent<span className="gradient-text">OS</span></span>
        </Link>

        <div className="relative">
          <div className="badge badge-purple mb-5 w-fit">Production-ready infra</div>
          <h2 className="text-2xl font-black mb-4 leading-snug">
            <span className="gradient-text">Infrastructure</span>
            <br />that ships with you.
          </h2>
          <p className="text-sm leading-relaxed mb-8" style={{ color: 'var(--text-muted)' }}>
            Sign in once, keep a secure browser session, then generate a bearer token only when you need external API access.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { name: 'os.mem', color: '#a855f7', label: 'Memory cache' },
              { name: 'os.fs', color: '#06b6d4', label: 'File storage' },
              { name: 'os.db', color: '#3b82f6', label: 'Database' },
              { name: 'os.net', color: '#22c55e', label: 'HTTP client' },
              { name: 'os.proc', color: '#f59e0b', label: 'Code runner' },
              { name: 'os.events', color: '#ec4899', label: 'Pub/sub' },
            ].map(p => (
              <div key={p.name} className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{ background: `${p.color}0d`, border: `1px solid ${p.color}20` }}>
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: p.color }} />
                <div>
                  <div className="font-mono text-xs font-bold" style={{ color: p.color }}>{p.name}</div>
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.65rem' }}>{p.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-xs" style={{ color: 'var(--text-dim)' }}>MIT License Â· Open Source</div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <Link href="/" className="flex items-center gap-2 mb-10 lg:hidden">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center font-black font-mono text-xs"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>A</div>
          <span className="font-mono font-bold">Agent<span className="gradient-text">OS</span></span>
        </Link>

        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-black mb-1">Welcome back</h1>
          <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>Sign in to your agent account.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-widest"
                style={{ color: 'var(--text-muted)' }}>Email</label>
              <input id="email" type="email" required autoFocus autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com" className="input-dark" />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-widest"
                  style={{ color: 'var(--text-muted)' }}>Password</label>
                <Link href="/forgot-password" className="text-xs hover:underline transition-colors"
                  style={{ color: '#a855f7' }}>
                  Forgot password?
                </Link>
              </div>
              <input id="password" type="password" required autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password" className="input-dark" />
            </div>

            {error && (
              <div className="rounded-lg px-4 py-3 text-sm"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}>
                {error}
                {error.includes('sign up') && (
                  <span> <Link href="/signup" className="underline font-medium text-white">Create account</Link></span>
                )}
              </div>
            )}

            <button type="submit" disabled={loading || !email || !password}
              className="btn-primary w-full py-3 rounded-lg"
              style={{ opacity: (loading || !email || !password) ? 0.5 : 1, cursor: (loading || !email || !password) ? 'not-allowed' : 'pointer' }}>
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin" width="14" height="14" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </span>
              ) : 'Sign in'}
            </button>
          </form>

          <div className="mt-6 pt-6 text-center text-sm"
            style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            No account?{' '}
            <Link href="/signup" className="font-medium hover:text-white transition-colors" style={{ color: '#a855f7' }}>
              Sign up free
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: 'var(--bg)' }} />}>
      <SignInContent />
    </Suspense>
  );
}

