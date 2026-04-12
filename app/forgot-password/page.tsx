'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function ForgotPasswordPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialEmail = searchParams.get('email') ?? '';
  const token = searchParams.get('token') ?? '';
  const confirmMode = Boolean(initialEmail && token);

  const [email, setEmail] = useState(initialEmail);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [debugResetUrl, setDebugResetUrl] = useState('');

  useEffect(() => {
    setEmail(initialEmail);
  }, [initialEmail]);

  const successMessage = useMemo(() => {
    if (confirmMode) {
      return 'Your password has been updated. You can now sign in with the new password.';
    }
    return 'If password reset delivery is configured for this deployment, a reset link will be sent to that email address.';
  }, [confirmMode]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (confirmMode) {
      if (newPassword !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
      if (newPassword.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
    }

    setLoading(true);
    try {
      const response = await fetch(confirmMode ? '/api/forgot-password/confirm' : '/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(confirmMode ? { email, token, newPassword } : { email }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }

      setDebugResetUrl(typeof data.resetUrl === 'string' ? data.resetUrl : '');
      setDone(true);
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
          style={{ background: 'radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)', filter: 'blur(60px)' }} />

        <Link href="/" className="relative flex items-center gap-2.5 w-fit">
          <div className="w-8 h-8 flex items-center justify-center font-black font-mono text-sm"
            style={{ background: 'var(--bg-primary)', border: '1px solid var(--accent)', color: 'var(--accent)' }}>
            A
          </div>
          <span className="font-mono font-bold">Agent<span style={{ color: 'var(--accent)' }}>OS</span></span>
        </Link>

        <div className="relative">
          <div className="badge badge-accent mb-5 w-fit">Account recovery</div>
          <h2 className="text-2xl font-black mb-4 leading-snug">
            {confirmMode ? 'Choose a new' : 'Request a'}
            <br /><span style={{ color: 'var(--accent)' }}>password reset.</span>
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {confirmMode
              ? 'Use the reset link you received to set a new password. Your API keys and agent data remain unchanged.'
              : 'Request a reset link for your account. Password changes now require a one-time token instead of only an email address.'}
          </p>
        </div>

        <div className="relative text-xs" style={{ color: 'var(--text-dim)' }}>MIT License | Open Source</div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <Link href="/" className="flex items-center gap-2 mb-10 lg:hidden">
          <div className="w-7 h-7 flex items-center justify-center font-black font-mono text-xs"
            style={{ background: 'var(--bg-primary)', border: '1px solid var(--accent)', color: 'var(--accent)' }}>A</div>
          <span className="font-mono font-bold">Agent<span style={{ color: 'var(--accent)' }}>OS</span></span>
        </Link>

        <div className="w-full max-w-sm">
          {done ? (
            <div className="text-center space-y-4">
              <div className="text-5xl">Done</div>
              <h1 className="text-2xl font-black">Request complete</h1>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{successMessage}</p>
              {debugResetUrl && (
                <div className="p-3 text-left text-xs font-mono break-all"
                  style={{ background: 'var(--code-bg)', border: '1px solid var(--code-border)', color: 'var(--accent)' }}>
                  Debug reset link: {debugResetUrl}
                </div>
              )}
              <button onClick={() => router.push('/signin')} className="btn-primary w-full py-3">
                Go to Sign In
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-black mb-1">{confirmMode ? 'Set a new password' : 'Request a reset link'}</h1>
              <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
                {confirmMode ? 'Enter and confirm your new password.' : 'Enter the email for the account you want to recover.'}
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-widest"
                    style={{ color: 'var(--text-muted)' }}>Email</label>
                  <input id="email" type="email" required autoFocus autoComplete="email"
                    value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com" className="input-dark" readOnly={confirmMode} />
                </div>

                {confirmMode && (
                  <>
                    <div className="space-y-1.5">
                      <label htmlFor="newPassword" className="block text-xs font-semibold uppercase tracking-widest"
                        style={{ color: 'var(--text-muted)' }}>New Password</label>
                      <input id="newPassword" type="password" required minLength={8} autoComplete="new-password"
                        value={newPassword} onChange={e => setNewPassword(e.target.value)}
                        placeholder="At least 8 characters" className="input-dark" />
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="confirmPassword" className="block text-xs font-semibold uppercase tracking-widest"
                        style={{ color: 'var(--text-muted)' }}>Confirm Password</label>
                      <input id="confirmPassword" type="password" required autoComplete="new-password"
                        value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="Repeat new password" className="input-dark" />
                    </div>
                  </>
                )}

                {error && (
                  <div className="rounded-lg px-4 py-3 text-sm"
                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}>
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading || !email || (confirmMode && (!newPassword || !confirmPassword))}
                  className="btn-primary w-full py-3"
                  style={{ opacity: (loading || !email || (confirmMode && (!newPassword || !confirmPassword))) ? 0.5 : 1,
                    cursor: (loading || !email || (confirmMode && (!newPassword || !confirmPassword))) ? 'not-allowed' : 'pointer' }}>
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin" width="14" height="14" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {confirmMode ? 'Updating...' : 'Requesting...'}
                    </span>
                  ) : (confirmMode ? 'Update password' : 'Request reset link')}
                </button>
              </form>

              <div className="mt-6 pt-6 text-center text-sm"
                style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                Remember your password?{' '}
                <Link href="/signin" className="font-medium hover:text-white transition-colors" style={{ color: 'var(--accent)' }}>
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

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: 'var(--bg)' }} />}>
      <ForgotPasswordPageContent />
    </Suspense>
  );
}
