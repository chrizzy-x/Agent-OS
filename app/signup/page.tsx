'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { APP_URL } from '@/lib/config';

interface Credentials {
  agentId: string;
  apiKey: string;
  expiresIn: string;
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-xs px-3 py-1.5 rounded-md font-medium transition-all flex-shrink-0"
      style={copied
        ? { background: 'rgba(34,197,94,0.12)', color: '#86efac', border: '1px solid rgba(34,197,94,0.25)' }
        : { background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', border: '1px solid var(--border-bright)' }}
    >
      {copied ? 'Copied' : label}
    </button>
  );
}

function CredentialsPanel({ credentials }: { credentials: Credentials }) {
  const quickstart = `const AGENT_OS_URL = '${APP_URL}';
const API_KEY = '${credentials.apiKey}';

// Store a value in memory
await fetch(\`\${AGENT_OS_URL}/mcp\`, {
  method: 'POST',
  headers: {
    'Authorization': \`Bearer \${API_KEY}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    tool: 'mem_set',
    input: { key: 'hello', value: 'world' }
  }),
});`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)' }}
        >
          <svg width="18" height="18" fill="none" stroke="#86efac" strokeWidth="2.5" viewBox="0 0 24 24">
            <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-black">Agent created!</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Save your credentials before closing.</p>
        </div>
      </div>

      <div
        className="rounded-xl p-4 space-y-4"
        style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}
      >
        <div className="flex items-start gap-2 text-sm" style={{ color: '#fcd34d' }}>
          <svg width="15" height="15" fill="currentColor" viewBox="0 0 20 20" className="flex-shrink-0 mt-0.5">
            <path fillRule="evenodd" d="M8.485 3.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 3.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          Your API key is shown <strong>only once</strong>. Copy and store it securely.
        </div>

        {[
          { label: 'Agent ID', value: credentials.agentId },
          { label: 'API Key', value: credentials.apiKey },
        ].map(field => (
          <div key={field.label} className="space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{field.label}</div>
            <div className="flex items-center gap-2">
              <div
                className="flex-1 rounded-lg px-3 py-2 font-mono text-xs truncate"
                style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-bright)', color: '#a78bfa' }}
              >
                {field.value}
              </div>
              <CopyButton text={field.value} />
            </div>
          </div>
        ))}
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Expires in {credentials.expiresIn}</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Quick start</span>
          <CopyButton text={quickstart} label="Copy all" />
        </div>
        <div className="terminal">
          <div className="terminal-header">
            <div className="terminal-dot" style={{ background: '#ef4444' }} />
            <div className="terminal-dot" style={{ background: '#f59e0b' }} />
            <div className="terminal-dot" style={{ background: '#22c55e' }} />
            <span className="ml-3 text-xs" style={{ color: 'var(--text-dim)' }}>quickstart.js</span>
          </div>
          <pre className="p-4 text-xs overflow-x-auto" style={{ color: '#94a3b8' }}>{quickstart}</pre>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { href: '/dashboard', label: 'Dashboard', primary: true },
          { href: '/studio', label: 'Studio', primary: false },
          { href: '/docs', label: 'Docs', primary: false },
          { href: '/marketplace', label: 'Skills', primary: false },
        ].map(button => (
          <Link
            key={button.href}
            href={button.href}
            className={`text-center text-sm py-2.5 rounded-lg font-medium transition-all ${button.primary ? 'btn-primary' : 'btn-outline'}`}
          >
            {button.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function SignupForm({ onSuccess }: { onSuccess: (creds: Credentials) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agentName, setAgentName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, agentName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }
      onSuccess(data.credentials);
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const ready = email && password && confirmPassword;

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            Email <span style={{ color: '#f87171' }}>*</span>
          </label>
          <input
            id="email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="input-dark"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            Password <span style={{ color: '#f87171' }}>*</span>
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="input-dark"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="confirmPassword" className="block text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            Confirm password <span style={{ color: '#f87171' }}>*</span>
          </label>
          <input
            id="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your password"
            className="input-dark"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="agentName" className="block text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            Agent name <span style={{ color: 'var(--text-dim)' }}>(optional)</span>
          </label>
          <input
            id="agentName"
            type="text"
            autoComplete="nickname"
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            placeholder="My Trading Bot"
            className="input-dark"
          />
        </div>

        {error && (
          <div
            className="rounded-lg px-4 py-3 text-sm"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !ready}
          className="btn-primary w-full py-3 rounded-lg"
          style={{ opacity: (loading || !ready) ? 0.5 : 1, cursor: (loading || !ready) ? 'not-allowed' : 'pointer' }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin" width="14" height="14" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Creating agent...
            </span>
          ) : 'Create agent ->'}
        </button>

        <p className="text-xs text-center" style={{ color: 'var(--text-dim)' }}>
          No credit card required. Free to use.
        </p>
      </form>

      <div className="mt-5 pt-5 text-center text-sm" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
        Already have an account?{' '}
        <Link href="/signin" className="font-medium hover:text-white transition-colors" style={{ color: '#a855f7' }}>
          Sign in
        </Link>
      </div>
    </>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  useEffect(() => {
    if (localStorage.getItem('apiKey')) router.replace('/dashboard');
  }, [router]);

  useEffect(() => {
    if (credentials?.apiKey) {
      localStorage.setItem('apiKey', credentials.apiKey);
      localStorage.setItem('agentId', credentials.agentId);
    }
  }, [credentials]);

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      <div
        className="hidden lg:flex flex-col justify-between w-[420px] flex-shrink-0 relative overflow-hidden p-10 bg-grid"
        style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}
      >
        <div
          className="absolute top-[-100px] right-[-60px] w-80 h-80 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.15) 0%, transparent 70%)', filter: 'blur(60px)' }}
        />
        <div
          className="absolute bottom-[-60px] left-[-60px] w-64 h-64 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)', filter: 'blur(60px)' }}
        />

        <Link href="/" className="relative flex items-center gap-2.5 w-fit">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center font-black font-mono text-sm"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', boxShadow: '0 0 16px rgba(124,58,237,0.5)' }}
          >
            A
          </div>
          <span className="font-mono font-bold">Agent<span className="gradient-text">OS</span></span>
        </Link>

        <div className="relative">
          <div className="badge badge-cyan mb-5 w-fit">Free to start</div>
          <h2 className="text-2xl font-black mb-4 leading-snug">
            Ship your agent<br /><span className="gradient-text">in 5 minutes.</span>
          </h2>
          <p className="text-sm leading-relaxed mb-8" style={{ color: 'var(--text-muted)' }}>
            Create your account and get instant access to all 6 primitives - no credit card, no setup, no infrastructure headaches.
          </p>

          <div className="space-y-3">
            {[
              'All 6 primitives included',
              'No credit card required',
              'API key valid for 90 days',
              'MIT license, self-hostable',
            ].map(item => (
              <div key={item} className="flex items-center gap-3 text-sm">
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}
                >
                  <svg width="10" height="10" fill="none" stroke="#86efac" strokeWidth="2.5" viewBox="0 0 12 12">
                    <polyline points="10 3 5 9 2 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span style={{ color: 'var(--text-muted)' }}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-xs" style={{ color: 'var(--text-dim)' }}>MIT License | Open Source</div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <Link href="/" className="flex items-center gap-2 mb-10 lg:hidden">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center font-black font-mono text-xs" style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
            A
          </div>
          <span className="font-mono font-bold">Agent<span className="gradient-text">OS</span></span>
        </Link>

        <div className="w-full max-w-sm">
          {!credentials ? (
            <>
              <h1 className="text-2xl font-black mb-1">Create your account</h1>
              <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
                Get started with Agent OS in seconds.
              </p>
              <SignupForm onSuccess={setCredentials} />
            </>
          ) : (
            <CredentialsPanel credentials={credentials} />
          )}
        </div>
      </div>
    </div>
  );
}

