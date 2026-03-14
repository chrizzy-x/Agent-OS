'use client';

import { useState, useEffect } from 'react';
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
      onClick={handleCopy}
      className={`text-xs px-3 py-1.5 rounded font-medium transition-colors ${
        copied
          ? 'bg-green-100 text-green-700'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {copied ? 'Copied!' : label}
    </button>
  );
}

function CredentialField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <div className="text-sm font-medium text-gray-700">{label}</div>
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-gray-50 border border-gray-200 rounded-md px-3 py-2.5 font-mono text-sm text-gray-800 truncate">
          {value}
        </div>
        <CopyButton text={value} />
      </div>
    </div>
  );
}

function QuickStartCode({ agentId, apiKey }: { agentId: string; apiKey: string }) {
  const code = `const AGENT_OS_URL = '${APP_URL}';
const API_KEY = '${apiKey}';
const AGENT_ID = '${agentId}';

// Check health
const health = await fetch(\`\${AGENT_OS_URL}/health\`).then(r => r.json());
console.log('Status:', health.status);

// Store a value in memory
await fetch(\`\${AGENT_OS_URL}/mcp\`, {
  method: 'POST',
  headers: {
    'Authorization': \`Bearer \${API_KEY}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ tool: 'mem_set', input: { key: 'hello', value: 'world' } }),
}).then(r => r.json());

// Read it back
const result = await fetch(\`\${AGENT_OS_URL}/mcp\`, {
  method: 'POST',
  headers: {
    'Authorization': \`Bearer \${API_KEY}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ tool: 'mem_get', input: { key: 'hello' } }),
}).then(r => r.json());

console.log(result); // { result: 'world' }`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">Quick start code</span>
        <CopyButton text={code} label="Copy all" />
      </div>
      <div className="relative rounded-lg bg-gray-950 border border-gray-200 overflow-hidden">
        <div className="flex items-center px-4 py-2 border-b border-gray-800">
          <span className="text-xs text-gray-500 font-mono">javascript</span>
        </div>
        <pre className="overflow-x-auto p-4 text-xs leading-relaxed">
          <code className="font-mono text-gray-300 whitespace-pre">{code}</code>
        </pre>
      </div>
      <p className="text-xs text-gray-500">
        This code is ready to run — paste it into any JavaScript/TypeScript environment.
      </p>
    </div>
  );
}

function CredentialsPanel({ credentials }: { credentials: Credentials }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-600 text-lg">
          ✓
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Agent created successfully!</h2>
          <p className="text-sm text-gray-500">Save your credentials before closing this page.</p>
        </div>
      </div>

      {/* Credentials box */}
      <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-4">
        <div className="flex items-start gap-2">
          <span className="text-amber-600 text-sm">⚠</span>
          <p className="text-sm text-amber-800 font-medium">
            Your API key is shown only once. Copy it now and store it securely.
          </p>
        </div>
        <CredentialField label="Agent ID" value={credentials.agentId} />
        <CredentialField label="API Key (Bearer Token)" value={credentials.apiKey} />
        <p className="text-xs text-amber-700">Expires in {credentials.expiresIn}</p>
      </div>

      {/* Quick start */}
      <QuickStartCode agentId={credentials.agentId} apiKey={credentials.apiKey} />

      {/* Next steps */}
      <div className="border border-gray-200 rounded-lg p-4 space-y-3">
        <p className="text-sm font-medium text-gray-700">Next steps</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Link
            href="/dashboard"
            className="flex-1 text-center text-sm bg-blue-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/docs"
            className="flex-1 text-center text-sm border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            Read the Docs
          </Link>
          <Link
            href="/marketplace"
            className="flex-1 text-center text-sm border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            Browse Skills
          </Link>
        </div>
      </div>
    </div>
  );
}

function SignupForm({ onSuccess }: { onSuccess: (creds: Credentials) => void }) {
  const [email, setEmail] = useState('');
  const [agentName, setAgentName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, agentName }),
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
          Email <span className="text-red-500">*</span>
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="agentName" className="block text-sm font-medium text-gray-700">
          Agent name <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          id="agentName"
          type="text"
          value={agentName}
          onChange={(e) => setAgentName(e.target.value)}
          placeholder="My Trading Bot"
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !email}
        className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Creating agent...' : 'Create Agent'}
      </button>

      <p className="text-xs text-gray-500 text-center">
        No credit card required. Free to use.
      </p>
    </form>
  );
}

export default function SignupPage() {
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  // Save API key to localStorage so dashboard can pick it up
  useEffect(() => {
    if (credentials?.apiKey) {
      localStorage.setItem('apiKey', credentials.apiKey);
    }
  }, [credentials]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="font-mono font-bold text-lg text-gray-900">Agent OS</Link>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <Link href="/marketplace" className="hover:text-gray-900">Marketplace</Link>
            <Link href="/docs" className="hover:text-gray-900">Docs</Link>
            <Link href="/dashboard" className="hover:text-gray-900">Dashboard</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-lg mx-auto px-4 py-12">
        {!credentials ? (
          <>
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Get started with Agent OS</h1>
              <p className="text-gray-500">Create your agent in under 30 seconds. No credit card required.</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <SignupForm onSuccess={setCredentials} />
            </div>
          </>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <CredentialsPanel credentials={credentials} />
          </div>
        )}
      </div>
    </div>
  );
}
