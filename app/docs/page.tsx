import Link from 'next/link';
import DocsFooter from '@/components/DocsFooter';
import { APP_URL } from '@/lib/config';

const sections = [
  {
    icon: '🚀',
    title: 'Quick Start',
    href: '/docs/sdk',
    desc: 'Create your agent, get credentials, and make your first API call in under 5 minutes.',
    badge: 'Start here',
    color: '#a855f7',
  },
  {
    icon: '🔧',
    title: 'API Reference',
    href: '/docs/api',
    desc: 'Complete reference for all REST endpoints — authentication, tools, MCP, FFP, admin.',
    badge: null,
    color: '#06b6d4',
  },
  {
    icon: '⚡',
    title: 'Primitives',
    href: '/docs/primitives',
    desc: 'Deep-dive into all 6 primitives: mem, fs, db, net, proc, events.',
    badge: null,
    color: '#3b82f6',
  },
  {
    icon: '📦',
    title: 'Skills',
    href: '/docs/skills',
    desc: 'Install skills from the marketplace, build your own, and earn revenue.',
    badge: null,
    color: '#22c55e',
  },
];

const primitives = [
  { name: 'mem', emoji: '💾', tools: ['mem_set', 'mem_get', 'mem_delete', 'mem_list', 'mem_incr', 'mem_expire'], color: '#a855f7' },
  { name: 'fs', emoji: '🗂️', tools: ['fs_write', 'fs_read', 'fs_list', 'fs_delete', 'fs_mkdir', 'fs_stat'], color: '#06b6d4' },
  { name: 'db', emoji: '🗄️', tools: ['db_query', 'db_insert', 'db_update', 'db_delete', 'db_create_table', 'db_transaction'], color: '#3b82f6' },
  { name: 'net', emoji: '🌐', tools: ['net_http_get', 'net_http_post', 'net_http_put', 'net_http_delete', 'net_dns_resolve'], color: '#22c55e' },
  { name: 'proc', emoji: '⚙️', tools: ['proc_execute', 'proc_schedule', 'proc_spawn', 'proc_kill', 'proc_list'], color: '#f59e0b' },
  { name: 'events', emoji: '📡', tools: ['events_publish', 'events_subscribe', 'events_unsubscribe', 'events_list_topics'], color: '#ec4899' },
];

export default function DocsPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Nav */}
      <nav className="sticky top-0 z-40 backdrop-blur-md"
        style={{ background: 'rgba(10,10,20,0.85)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center font-black font-mono text-xs"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', boxShadow: '0 0 12px rgba(124,58,237,0.4)' }}>
              A
            </div>
            <span className="font-mono font-bold text-sm">Agent<span className="gradient-text">OS</span></span>
          </Link>
          <div className="flex items-center gap-5 text-sm">
            <Link href="/marketplace" className="transition-colors hover:text-white" style={{ color: 'var(--text-muted)' }}>Marketplace</Link>
            <Link href="/developer" className="transition-colors hover:text-white" style={{ color: 'var(--text-muted)' }}>Developer</Link>
            <Link href="/dashboard" className="transition-colors hover:text-white" style={{ color: 'var(--text-muted)' }}>Dashboard</Link>
            <Link href="/signup" className="btn-primary text-xs px-4 py-2">Get Started</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-12">
          <div className="badge badge-purple mb-4">Reference</div>
          <h1 className="text-4xl font-black mb-3">
            <span className="gradient-text">Documentation</span>
          </h1>
          <p className="text-xl" style={{ color: 'var(--text-muted)' }}>
            Everything you need to build, deploy, and extend autonomous AI agents with Agent OS.
          </p>
        </div>

        {/* Section cards */}
        <div className="grid sm:grid-cols-2 gap-4 mb-14">
          {sections.map(s => (
            <Link key={s.href} href={s.href} className="card p-6 block group">
              <div className="flex items-start justify-between mb-3">
                <span className="text-3xl">{s.icon}</span>
                {s.badge && (
                  <span className="badge badge-purple text-xs">{s.badge}</span>
                )}
              </div>
              <h2 className="text-lg font-bold mb-1 transition-colors group-hover:text-purple-400"
                style={{ color: 'var(--text)' }}>
                {s.title}
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{s.desc}</p>
            </Link>
          ))}
        </div>

        {/* Primitives at a glance */}
        <div className="mb-14">
          <h2 className="text-2xl font-black mb-6">6 Primitives at a Glance</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {primitives.map(p => (
              <Link key={p.name} href={`/docs/primitives#${p.name}`}
                className="card p-4 block group transition-all"
                style={{ borderColor: `${p.color}20` }}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">{p.emoji}</span>
                  <code className="font-mono font-bold text-sm transition-colors" style={{ color: p.color }}>
                    {p.name}
                  </code>
                </div>
                <div className="flex flex-wrap gap-1">
                  {p.tools.map(t => (
                    <span key={t} className="text-xs font-mono rounded px-1.5 py-0.5"
                      style={{ background: `${p.color}12`, color: p.color, border: `1px solid ${p.color}25` }}>
                      {t}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Base URL */}
        <div className="card p-6 mb-8">
          <h3 className="text-base font-bold mb-3">Base URL</h3>
          <code className="font-mono text-sm px-4 py-2.5 rounded-lg block mb-3"
            style={{ background: '#050508', color: '#22c55e', border: '1px solid var(--border)' }}>
            {APP_URL}
          </code>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            All API requests use this base URL. The API accepts and returns JSON. Authentication is via Bearer token.
          </p>
        </div>

        {/* Quick example */}
        <div className="terminal">
          <div className="terminal-header">
            <div className="terminal-dot" style={{ background: '#ff5f57' }} />
            <div className="terminal-dot" style={{ background: '#febc2e' }} />
            <div className="terminal-dot" style={{ background: '#28c840' }} />
            <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>30-second example</span>
            <div className="ml-auto">
              <Link href="/docs/sdk" className="text-xs hover:underline" style={{ color: '#a855f7' }}>Full guide →</Link>
            </div>
          </div>
          <div className="p-5">
            <pre className="text-xs font-mono leading-relaxed overflow-x-auto" style={{ color: '#94a3b8' }}>{`const AGENT_OS = '${APP_URL}';
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
