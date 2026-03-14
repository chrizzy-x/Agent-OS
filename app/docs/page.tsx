import Link from 'next/link';
import DocsFooter from '@/components/DocsFooter';

const sections = [
  {
    icon: '🚀',
    title: 'Quick Start',
    href: '/docs/sdk',
    desc: 'Create your agent, get credentials, and make your first API call in under 5 minutes.',
    badge: 'Start here',
  },
  {
    icon: '🔧',
    title: 'API Reference',
    href: '/docs/api',
    desc: 'Complete reference for all REST endpoints — authentication, tools, MCP, FFP, admin.',
    badge: null,
  },
  {
    icon: '⚡',
    title: 'Primitives',
    href: '/docs/primitives',
    desc: 'Deep-dive into all 6 primitives: mem, fs, db, net, proc, events.',
    badge: null,
  },
  {
    icon: '📦',
    title: 'Skills',
    href: '/docs/skills',
    desc: 'Install skills from the marketplace, build your own, and earn revenue.',
    badge: null,
  },
];

const primitives = [
  { name: 'mem', emoji: '💾', tools: ['mem_set', 'mem_get', 'mem_delete', 'mem_list', 'mem_incr', 'mem_expire'], color: 'blue' },
  { name: 'fs', emoji: '🗂️', tools: ['fs_write', 'fs_read', 'fs_list', 'fs_delete', 'fs_mkdir', 'fs_stat'], color: 'green' },
  { name: 'db', emoji: '🗄️', tools: ['db_query', 'db_insert', 'db_update', 'db_delete', 'db_create_table', 'db_transaction'], color: 'purple' },
  { name: 'net', emoji: '🌐', tools: ['net_http_get', 'net_http_post', 'net_http_put', 'net_http_delete', 'net_dns_resolve'], color: 'orange' },
  { name: 'proc', emoji: '⚙️', tools: ['proc_execute', 'proc_schedule', 'proc_spawn', 'proc_kill', 'proc_list'], color: 'red' },
  { name: 'events', emoji: '📡', tools: ['events_publish', 'events_subscribe', 'events_unsubscribe', 'events_list_topics'], color: 'indigo' },
];

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="font-mono font-bold text-lg text-gray-900">Agent OS</Link>
          <div className="flex items-center gap-5 text-sm text-gray-500">
            <Link href="/marketplace" className="hover:text-gray-900">Marketplace</Link>
            <Link href="/developer" className="hover:text-gray-900">Developer</Link>
            <Link href="/dashboard" className="hover:text-gray-900">Dashboard</Link>
            <Link href="/signup" className="bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 transition-colors">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">Documentation</h1>
          <p className="text-xl text-gray-500">
            Everything you need to build, deploy, and extend autonomous AI agents with Agent OS.
          </p>
        </div>

        {/* Section cards */}
        <div className="grid sm:grid-cols-2 gap-4 mb-14">
          {sections.map(s => (
            <Link key={s.href} href={s.href}
              className="group border border-gray-200 rounded-xl p-6 hover:border-blue-300 hover:shadow-sm transition-all">
              <div className="flex items-start justify-between mb-3">
                <span className="text-3xl">{s.icon}</span>
                {s.badge && (
                  <span className="text-xs bg-blue-100 text-blue-700 font-medium px-2 py-0.5 rounded">
                    {s.badge}
                  </span>
                )}
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1 group-hover:text-blue-600">{s.title}</h2>
              <p className="text-sm text-gray-500 leading-relaxed">{s.desc}</p>
            </Link>
          ))}
        </div>

        {/* Primitives at a glance */}
        <div className="mb-14">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">6 Primitives at a Glance</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {primitives.map(p => (
              <Link key={p.name} href={`/docs/primitives#${p.name}`}
                className="border border-gray-200 rounded-xl p-4 hover:border-blue-200 hover:bg-blue-50/30 transition-all group">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">{p.emoji}</span>
                  <code className="font-mono font-bold text-gray-900 group-hover:text-blue-700">{p.name}</code>
                </div>
                <div className="flex flex-wrap gap-1">
                  {p.tools.map(t => (
                    <span key={t} className="text-xs font-mono bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{t}</span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Base URL */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 mb-8">
          <h3 className="text-base font-semibold text-gray-900 mb-3">Base URL</h3>
          <code className="font-mono text-sm bg-gray-900 text-green-400 px-4 py-2 rounded block">
            https://agentos-app.vercel.app
          </code>
          <p className="text-sm text-gray-500 mt-3">
            All API requests use this base URL. The API accepts and returns JSON. Authentication is via Bearer token.
          </p>
        </div>

        {/* Quick example */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">30-second example</span>
            <Link href="/docs/sdk" className="text-xs text-blue-600 hover:underline">Full guide →</Link>
          </div>
          <div className="bg-gray-950 p-5">
            <pre className="text-xs font-mono text-gray-300 overflow-x-auto leading-relaxed">{`const AGENT_OS = 'https://agentos-app.vercel.app';
const API_KEY  = 'eyJ...';   // from /signup

// Store a value in cache
await fetch(\`\${AGENT_OS}/mcp\`, {
  method: 'POST',
  headers: { Authorization: \`Bearer \${API_KEY}\`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ tool: 'mem_set', input: { key: 'hello', value: 'world', ttl: 3600 } }),
}).then(r => r.json());
// → { result: true }

// Retrieve it
const { result } = await fetch(\`\${AGENT_OS}/mcp\`, {
  method: 'POST',
  headers: { Authorization: \`Bearer \${API_KEY}\`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ tool: 'mem_get', input: { key: 'hello' } }),
}).then(r => r.json());
// → { result: 'world' }`}</pre>
          </div>
        </div>
      </div>

      <DocsFooter />
    </div>
  );
}

