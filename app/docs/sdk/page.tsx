import Link from 'next/link';
import DocsFooter from '@/components/DocsFooter';

export default function SdkPage() {
  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="font-mono font-bold text-lg text-gray-900">Agent OS</Link>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <Link href="/docs" className="text-blue-600">← Docs</Link>
            <Link href="/docs/api" className="hover:text-gray-900">API Reference</Link>
            <Link href="/docs/primitives" className="hover:text-gray-900">Primitives</Link>
            <Link href="/docs/skills" className="hover:text-gray-900">Skills</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="inline-block bg-blue-50 text-blue-700 text-sm font-medium px-3 py-1 rounded-full mb-4">
          Start here
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Quick Start</h1>
        <p className="text-lg text-gray-500 mb-10">
          Get your agent up and running in under 5 minutes. No SDK required — just HTTP.
        </p>

        {/* Step 1 */}
        <Step n={1} title="Create your agent">
          <p className="text-gray-600 mb-4">
            Go to <Link href="/signup" className="text-blue-600 hover:underline">/signup</Link> and enter your email.
            You will receive an <strong>Agent ID</strong> and <strong>API Key</strong>.
            Save these — the API key is shown only once.
          </p>
          <p className="text-sm text-gray-500">
            Or use the API directly:
          </p>
          <Code>{`curl -s -X POST https://agentos-app.vercel.app/api/signup \\
  -H "Content-Type: application/json" \\
  -d '{"email":"you@example.com","agentName":"My Agent"}' | jq`}</Code>
          <Result>{`{
  "success": true,
  "credentials": {
    "agentId": "agent_abc123...",
    "apiKey": "eyJhbGciOiJIUzI1NiJ9...",
    "expiresIn": "90 days"
  }
}`}</Result>
        </Step>

        {/* Step 2 */}
        <Step n={2} title="Make your first API call">
          <p className="text-gray-600 mb-4">
            Store a value in the memory cache using the <code className="font-mono text-sm bg-gray-100 px-1 rounded">mem_set</code> tool:
          </p>
          <Code>{`const API_KEY = 'eyJhbGciOiJIUzI1NiJ9...'; // your key

const res = await fetch('https://agentos-app.vercel.app/mcp', {
  method: 'POST',
  headers: {
    Authorization: \`Bearer \${API_KEY}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    tool: 'mem_set',
    input: { key: 'greeting', value: 'Hello, Agent OS!', ttl: 3600 },
  }),
});

const { result } = await res.json();
console.log(result); // true`}</Code>
        </Step>

        {/* Step 3 */}
        <Step n={3} title="Read it back">
          <Code>{`const { result } = await fetch('https://agentos-app.vercel.app/mcp', {
  method: 'POST',
  headers: { Authorization: \`Bearer \${API_KEY}\`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ tool: 'mem_get', input: { key: 'greeting' } }),
}).then(r => r.json());

console.log(result); // 'Hello, Agent OS!'`}</Code>
        </Step>

        {/* Step 4 */}
        <Step n={4} title="Store data in your private database">
          <Code>{`// Create a table
await mcp('db_create_table', {
  table: 'events',
  schema: [
    { column: 'id',         type: 'uuid',        primaryKey: true },
    { column: 'type',       type: 'text',        nullable: false },
    { column: 'payload',    type: 'jsonb',       nullable: true },
    { column: 'created_at', type: 'timestamptz', nullable: false },
  ],
});

// Insert a row
await mcp('db_insert', {
  table: 'events',
  data: { id: crypto.randomUUID(), type: 'startup', payload: { version: '1.0' }, created_at: new Date() },
});

// Query
const rows = await mcp('db_query', {
  sql: "SELECT * FROM events WHERE type = $1 ORDER BY created_at DESC LIMIT 10",
  params: ['startup'],
});`}</Code>
        </Step>

        {/* Step 5 */}
        <Step n={5} title="Call an external API">
          <Code>{`const data = await mcp('net_http_get', {
  url: 'https://api.coincap.io/v2/assets/bitcoin',
  headers: { Accept: 'application/json' },
});

console.log(data.body.data.priceUsd); // live BTC price`}</Code>
        </Step>

        {/* Step 6 */}
        <Step n={6} title="Run code in a sandbox">
          <Code>{`const output = await mcp('proc_execute', {
  language: 'python',
  code: \`
import json, sys
prices = [42000, 43100, 41800, 44200, 43900]
avg = sum(prices) / len(prices)
high = max(prices)
low  = min(prices)
print(json.dumps({"avg": avg, "high": high, "low": low}))
\`,
  timeout: 10000,
});

const stats = JSON.parse(output.stdout);
console.log(stats); // { avg: 42920, high: 44200, low: 41800 }`}</Code>
        </Step>

        {/* Step 7 */}
        <Step n={7} title="Install and use a skill">
          <Code>{`// Install the JSON Transformer skill
await fetch('https://agentos-app.vercel.app/api/skills/install', {
  method: 'POST',
  headers: { Authorization: \`Bearer \${API_KEY}\`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ skill_id: '<skill-uuid>' }),
});

// Use a capability
const { result } = await fetch('https://agentos-app.vercel.app/api/skills/use', {
  method: 'POST',
  headers: { Authorization: \`Bearer \${API_KEY}\`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    skill_slug: 'json-transformer',
    capability: 'filter',
    params: { array: data, key: 'status', value: 'active' },
  }),
}).then(r => r.json());`}</Code>
        </Step>

        {/* Helper */}
        <div className="mt-10 bg-gray-50 border border-gray-200 rounded-xl p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-3">Helper function</h3>
          <p className="text-sm text-gray-500 mb-4">
            Copy this helper to simplify all MCP calls in your project:
          </p>
          <Code>{`const AGENT_OS_URL = 'https://agentos-app.vercel.app';
const API_KEY = process.env.AGENT_OS_KEY;

async function mcp(tool, input) {
  const res = await fetch(\`\${AGENT_OS_URL}/mcp\`, {
    method: 'POST',
    headers: {
      Authorization: \`Bearer \${API_KEY}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tool, input }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Agent OS error');
  return data.result;
}

// Usage:
await mcp('mem_set', { key: 'x', value: 42 });
await mcp('fs_write', { path: '/out.txt', data: btoa('hello') });
await mcp('db_insert', { table: 'logs', data: { msg: 'started' } });`}</Code>
        </div>

        {/* What's next */}
        <div className="mt-10">
          <h2 className="text-xl font-bold text-gray-900 mb-4">What&apos;s next?</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { href: '/docs/primitives', icon: '⚡', title: 'All 30 tools', desc: 'Complete reference for every primitive and its parameters' },
              { href: '/marketplace', icon: '📦', title: 'Browse Skills', desc: 'Install community skills to extend your agent instantly' },
              { href: '/docs/skills', icon: '🛠️', title: 'Build a Skill', desc: 'Publish your own skill and earn 70% revenue share' },
            ].map(c => (
              <Link key={c.href} href={c.href}
                className="border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition-all group">
                <div className="text-2xl mb-2">{c.icon}</div>
                <div className="font-semibold text-sm text-gray-900 mb-1 group-hover:text-blue-600">{c.title}</div>
                <div className="text-xs text-gray-500">{c.desc}</div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <DocsFooter />
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-10">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
          {n}
        </div>
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
      </div>
      <div className="ml-11">{children}</div>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <div className="bg-gray-950 rounded-lg overflow-hidden mt-3">
      <pre className="p-4 text-xs font-mono text-gray-300 overflow-x-auto leading-relaxed whitespace-pre">
        {children}
      </pre>
    </div>
  );
}

function Result({ children }: { children: string }) {
  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden mt-2">
      <div className="px-3 py-1.5 text-xs text-gray-500 border-b border-gray-700">Response</div>
      <pre className="p-4 text-xs font-mono text-green-400 overflow-x-auto leading-relaxed whitespace-pre">
        {children}
      </pre>
    </div>
  );
}
