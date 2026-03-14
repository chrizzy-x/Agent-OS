'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }
      setDone(true);
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      {/* Left panel */}
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
          <div className="badge badge-purple mb-5 w-fit">Account recovery</div>
          <h2 className="text-2xl font-black mb-4 leading-snug">
            Reset your
            <br /><span className="gradient-text">password.</span>
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Enter your email and choose a new password. Your API keys and agent data remain unchanged.
          </p>
        </div>

        <div className="relative text-xs" style={{ color: 'var(--text-dim)' }}>MIT License · Open Source</div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <Link href="/" className="flex items-center gap-2 mb-10 lg:hidden">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center font-black font-mono text-xs"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>A</div>
          <span className="font-mono font-bold">Agent<span className="gradient-text">OS</span></span>
        </Link>

        <div className="w-full max-w-sm">
          {done ? (
            <div className="text-center">
              <div className="text-5xl mb-4">✅</div>
              <h1 className="text-2xl font-black mb-2">Password updated</h1>
              <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
                Your password has been reset. You can now sign in with your new password.
              </p>
              <button onClick={() => router.push('/signin')} className="btn-primary w-full py-3">
                Go to Sign In →
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-black mb-1">Reset password</h1>
              <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
                Enter your email and a new password.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-widest"
                    style={{ color: 'var(--text-muted)' }}>Email</label>
                  <input id="email" type="email" required autoFocus
                    value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com" className="input-dark" />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="newPassword" className="block text-xs font-semibold uppercase tracking-widest"
                    style={{ color: 'var(--text-muted)' }}>New Password</label>
                  <input id="newPassword" type="password" required minLength={8}
                    value={newPassword} onChange={e => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters" className="input-dark" />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="confirm" className="block text-xs font-semibold uppercase tracking-widest"
                    style={{ color: 'var(--text-muted)' }}>Confirm Password</label>
                  <input id="confirm" type="password" required
                    value={confirm} onChange={e => setConfirm(e.target.value)}
                    placeholder="Repeat new password" className="input-dark" />
                </div>

                {error && (
                  <div className="rounded-lg px-4 py-3 text-sm"
                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}>
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading || !email || !newPassword || !confirm}
                  className="btn-primary w-full py-3 rounded-lg"
                  style={{ opacity: (loading || !email || !newPassword || !confirm) ? 0.5 : 1,
                    cursor: (loading || !email || !newPassword || !confirm) ? 'not-allowed' : 'pointer' }}>
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin" width="14" height="14" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Resetting…
                    </span>
                  ) : 'Reset password →'}
                </button>
              </form>

              <div className="mt-6 pt-6 text-center text-sm"
                style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                Remember your password?{' '}
                <Link href="/signin" className="font-medium hover:text-white transition-colors" style={{ color: '#a855f7' }}>
                  Sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
