'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { APP_URL } from '@/lib/config';
import { fetchBrowserSession } from '@/src/auth/browser-session';

interface Credentials {
  agentId: string;
  bearerToken: string;
  apiKey?: string;
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
      style={{
        background: 'none',
        border: `1px solid ${copied ? 'var(--accent)' : 'var(--border)'}`,
        color: copied ? 'var(--accent)' : 'var(--text-secondary)',
        fontSize: '11px',
        fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
        padding: '3px 10px',
        cursor: 'pointer',
        borderRadius: '2px',
        transition: 'color 150ms, border-color 150ms',
        flexShrink: 0,
      }}
    >
      {copied ? 'copied!' : label}
    </button>
  );
}

function CredentialsPanel({ credentials }: { credentials: Credentials }) {
  const bearerToken = credentials.bearerToken || credentials.apiKey || '';
  const quickstart = `const AGENT_OS_URL = '${APP_URL}';
const BEARER_TOKEN = '${bearerToken}';

// Store a value in memory
await fetch(\`\${AGENT_OS_URL}/mcp\`, {
  method: 'POST',
  headers: {
    'Authorization': \`Bearer \${BEARER_TOKEN}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    tool: 'mem_set',
    input: { key: 'hello', value: 'world' }
  }),
});`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Success header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '36px',
          height: '36px',
          border: '1px solid rgba(0,255,136,0.3)',
          background: 'rgba(0,255,136,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width="16" height="16" fill="none" stroke="var(--accent)" strokeWidth="2.5" viewBox="0 0 24 24">
            <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <h2 style={{
            fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            margin: 0,
          }}>Agent created!</h2>
          <p style={{
            fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
            fontSize: '13px',
            color: 'var(--text-secondary)',
            margin: 0,
          }}>Save your bearer token — it&apos;s shown only once.</p>
        </div>
      </div>

      {/* Warning + credentials */}
      <div style={{
        padding: '16px',
        background: 'rgba(255,170,0,0.06)',
        border: '1px solid rgba(255,170,0,0.25)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
          color: 'var(--warning)',
          fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
          fontSize: '12px',
        }}>
          <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20" style={{ flexShrink: 0, marginTop: '1px' }}>
            <path fillRule="evenodd" d="M8.485 3.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 3.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          <span>Your bearer token is shown <strong>only once</strong>. Copy and store it securely.</span>
        </div>

        {[
          { label: 'Agent ID', value: credentials.agentId },
          { label: 'Bearer Token', value: bearerToken },
        ].map(field => (
          <div key={field.label}>
            <div style={{
              fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
              fontSize: '11px',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase' as const,
              letterSpacing: '0.06em',
              marginBottom: '6px',
            }}>{field.label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                flex: 1,
                padding: '8px 12px',
                fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                fontSize: '11px',
                color: 'var(--accent)',
                background: 'var(--code-bg)',
                border: '1px solid var(--code-border)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>{field.value}</div>
              <CopyButton text={field.value} />
            </div>
          </div>
        ))}
        <p style={{
          fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
          fontSize: '12px',
          color: 'var(--text-tertiary)',
          margin: 0,
        }}>Expires in {credentials.expiresIn}</p>
      </div>

      {/* Quick start */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{
            fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--text-primary)',
          }}>Quick start</span>
          <CopyButton text={quickstart} label="copy all" />
        </div>
        <div className="terminal">
          <div className="terminal-header">
            <div className="terminal-dot" style={{ background: '#ff5f57' }} />
            <div className="terminal-dot" style={{ background: '#ffbd2e' }} />
            <div className="terminal-dot" style={{ background: '#28c840' }} />
            <span style={{ marginLeft: '12px', fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono), JetBrains Mono, monospace' }}>quickstart.js</span>
          </div>
          <pre style={{ padding: '16px', fontSize: '11px', overflowX: 'auto', color: 'var(--text-secondary)', margin: 0 }}>{quickstart}</pre>
        </div>
      </div>

      {/* Navigation links */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        {[
          { href: '/dashboard', label: 'Dashboard', primary: true },
          { href: '/studio', label: 'Studio', primary: false },
          { href: '/docs', label: 'Docs', primary: false },
          { href: '/marketplace', label: 'Skills', primary: false },
        ].map(btn => (
          <Link
            key={btn.href}
            href={btn.href}
            className={btn.primary ? 'btn-primary' : 'btn-ghost'}
            style={{ justifyContent: 'center', fontSize: '13px', padding: '10px 16px' }}
          >
            {btn.label}
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

    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, agentName }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong. Please try again.'); return; }
      onSuccess(data.credentials);
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const ready = email && password && confirmPassword;
  const labelStyle = {
    display: 'block' as const,
    fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
    fontSize: '12px',
    fontWeight: 500,
    color: 'var(--text-secondary)',
    marginBottom: '6px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
  };

  return (
    <>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label htmlFor="email" style={labelStyle}>Email <span style={{ color: 'var(--danger)' }}>*</span></label>
          <input id="email" type="email" required autoFocus autoComplete="email"
            value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com" className="input-dark" />
        </div>

        <div>
          <label htmlFor="password" style={labelStyle}>Password <span style={{ color: 'var(--danger)' }}>*</span></label>
          <input id="password" type="password" required autoComplete="new-password"
            value={password} onChange={e => setPassword(e.target.value)}
            placeholder="At least 8 characters" className="input-dark" />
        </div>

        <div>
          <label htmlFor="confirmPassword" style={labelStyle}>Confirm password <span style={{ color: 'var(--danger)' }}>*</span></label>
          <input id="confirmPassword" type="password" required autoComplete="new-password"
            value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your password" className="input-dark" />
        </div>

        <div>
          <label htmlFor="agentName" style={labelStyle}>
            Agent name <span style={{ color: 'var(--text-tertiary)' }}>(optional)</span>
          </label>
          <input id="agentName" type="text" autoComplete="nickname"
            value={agentName} onChange={e => setAgentName(e.target.value)}
            placeholder="My Trading Bot" className="input-dark" />
        </div>

        {error && (
          <div style={{
            padding: '12px 16px',
            background: 'rgba(255,68,68,0.08)',
            border: '1px solid rgba(255,68,68,0.3)',
            color: 'var(--danger)',
            fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
            fontSize: '13px',
          }}>{error}</div>
        )}

        <button
          type="submit"
          disabled={loading || !ready}
          className="btn-primary"
          style={{
            width: '100%',
            justifyContent: 'center',
            opacity: (loading || !ready) ? 0.5 : 1,
            cursor: (loading || !ready) ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
              <svg style={{ animation: 'spin 1s linear infinite' }} width="14" height="14" fill="none" viewBox="0 0 24 24">
                <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Creating agent...
            </span>
          ) : 'Create agent →'}
        </button>

        <p style={{
          textAlign: 'center',
          fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
          fontSize: '12px',
          color: 'var(--text-tertiary)',
          margin: 0,
        }}>No credit card required. Free to use.</p>
      </form>

      <div style={{
        borderTop: '1px solid var(--border)',
        marginTop: '20px',
        paddingTop: '20px',
        textAlign: 'center',
        fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
        fontSize: '13px',
        color: 'var(--text-secondary)',
      }}>
        Already have an account?{' '}
        <Link href="/signin" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>Sign in</Link>
      </div>
    </>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  useEffect(() => {
    let active = true;
    void fetchBrowserSession().then(session => {
      if (active && session) router.replace('/dashboard');
    });
    return () => { active = false; };
  }, [router]);

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
        maxWidth: credentials ? '480px' : '400px',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        padding: '32px',
        transition: 'max-width 300ms ease',
      }}>
        {!credentials ? (
          <>
            <h1 style={{
              fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
              fontSize: '22px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: '6px',
              marginTop: 0,
            }}>Create your account</h1>
            <p style={{
              fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
              fontSize: '14px',
              color: 'var(--text-secondary)',
              marginBottom: '28px',
              marginTop: 0,
            }}>Get started with AgentOS in seconds.</p>
            <SignupForm onSuccess={setCredentials} />
          </>
        ) : (
          <CredentialsPanel credentials={credentials} />
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
