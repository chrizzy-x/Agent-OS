import Link from 'next/link';
import DocsFooter from '@/components/DocsFooter';
import { APP_URL } from '@/lib/config';

const sections = [
  {
    title: 'Quick Start',
    href: '/docs/sdk',
    desc: 'Create your agent, get credentials, and make your first API call in under 5 minutes.',
    badge: 'Start here',
  },
  {
    title: 'API Reference',
    href: '/docs/api',
    desc: 'Live route contracts for signup, signin, Studio, MCP, skills, and ops.',
    badge: null,
  },
  {
    title: 'Launch Notes',
    href: '/docs/launch',
    desc: 'Developer-first launch summary, changelog, and the real production URL status.',
    badge: 'Live',
  },
  {
    title: 'Production Audit',
    href: '/docs/audit',
    desc: 'Findings-first report from the March 19, 2026 live audit, with fixes and open DNS work.',
    badge: 'Verified',
  },
  {
    title: 'Primitives',
    href: '/docs/primitives',
    desc: 'Deep dive into mem, fs, db, net, proc, and events.',
    badge: null,
  },
  {
    title: 'Skills',
    href: '/docs/skills',
    desc: 'Install marketplace skills, publish your own, and meter usage.',
    badge: null,
  },
];

const primitives = [
  { name: 'mem', tools: ['mem_set', 'mem_get', 'mem_delete', 'mem_list', 'mem_incr', 'mem_expire'], color: '#a855f7' },
  { name: 'fs', tools: ['fs_write', 'fs_read', 'fs_list', 'fs_delete', 'fs_mkdir', 'fs_stat'], color: '#06b6d4' },
  { name: 'db', tools: ['db_query', 'db_insert', 'db_update', 'db_delete', 'db_create_table', 'db_transaction'], color: '#3b82f6' },
  { name: 'net', tools: ['net_http_get', 'net_http_post', 'net_http_put', 'net_http_delete', 'net_dns_resolve'], color: '#22c55e' },
  { name: 'proc', tools: ['proc_execute', 'proc_schedule', 'proc_spawn', 'proc_kill', 'proc_list'], color: '#f59e0b' },
  { name: 'events', tools: ['events_publish', 'events_subscribe', 'events_unsubscribe', 'events_list_topics'], color: '#ec4899' },
];

export default function DocsPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <nav className="sticky top-0 z-40 backdrop-blur-md" style={{ background: 'rgba(10,10,20,0.85)', borderBottom: '1px solid var(--border)' }}>
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
            <Link href="/studio" className="transition-colors hover:text-white" style={{ color: 'var(--text-muted)' }}>Studio</Link>
            <Link href="/ops" className="transition-colors hover:text-white" style={{ color: 'var(--text-muted)' }}>Ops</Link>
            <Link href="/signup" className="btn-primary text-xs px-4 py-2">Get Started</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="mb-12">
          <div className="badge badge-purple mb-4">Reference</div>
          <h1 className="text-4xl font-black mb-3">
            <span className="gradient-text">Documentation</span>
          </h1>
          <p className="text-xl" style={{ color: 'var(--text-muted)' }}>
            Live developer docs for building, operating, and extending autonomous agents on Agent OS.
          </p>
        </div>

        <div className="card p-6 mb-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold mb-2">Production status</h2>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Canonical live URL: <code>{APP_URL}</code>. The custom domain <code>https://agentos.service</code> is still activating and needs the apex DNS record <code>A @ -&gt; 76.76.21.21</code>.
              </p>
            </div>
            <div className="flex gap-3 flex-wrap">
              <Link href="/docs/launch" className="btn-outline text-xs px-4 py-2">Launch Notes</Link>
              <Link href="/docs/audit" className="btn-outline text-xs px-4 py-2">Production Audit</Link>
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-14">
          {sections.map(section => (
            <Link key={section.href} href={section.href} className="card p-6 block group">
              <div className="flex items-start justify-between mb-3">
                <span className="text-xs font-mono uppercase" style={{ color: 'var(--text-dim)' }}>{section.href}</span>
                {section.badge && (
                  <span className="badge badge-purple text-xs">{section.badge}</span>
                )}
              </div>
              <h2 className="text-lg font-bold mb-1 transition-colors group-hover:text-purple-400" style={{ color: 'var(--text)' }}>
                {section.title}
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{section.desc}</p>
            </Link>
          ))}
        </div>

        <div className="mb-14">
          <h2 className="text-2xl font-black mb-6">6 primitives at a glance</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {primitives.map(primitive => (
              <Link
                key={primitive.name}
                href={`/docs/primitives#${primitive.name}`}
                className="card p-4 block group transition-all"
                style={{ borderColor: `${primitive.color}20` }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <code className="font-mono font-bold text-sm transition-colors" style={{ color: primitive.color }}>
                    {primitive.name}
                  </code>
                </div>
                <div className="flex flex-wrap gap-1">
                  {primitive.tools.map(tool => (
                    <span
                      key={tool}
                      className="text-xs font-mono rounded px-1.5 py-0.5"
                      style={{ background: `${primitive.color}12`, color: primitive.color, border: `1px solid ${primitive.color}25` }}
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="card p-6 mb-8">
          <h3 className="text-base font-bold mb-3">Base URL</h3>
          <code className="font-mono text-sm px-4 py-2.5 rounded-lg block mb-3" style={{ background: '#050508', color: '#22c55e', border: '1px solid var(--border)' }}>
            {APP_URL}
          </code>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            All API requests use this base URL. Authentication is via Bearer token. Ops-control mutations require an ops-admin bearer token or the admin token.
          </p>
        </div>

        <div className="terminal">
          <div className="terminal-header">
            <div className="terminal-dot" style={{ background: '#ff5f57' }} />
            <div className="terminal-dot" style={{ background: '#febc2e' }} />
            <div className="terminal-dot" style={{ background: '#28c840' }} />
            <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>30-second example</span>
            <div className="ml-auto">
              <Link href="/studio" className="text-xs hover:underline" style={{ color: '#a855f7' }}>Open Studio -&gt;</Link>
            </div>
          </div>
          <div className="p-5">
            <pre className="text-xs font-mono leading-relaxed overflow-x-auto" style={{ color: '#94a3b8' }}>{`const AGENT_OS = '${APP_URL}';
const API_KEY = 'eyJ...';

await fetch(AGENT_OS + '/api/studio/command', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + API_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ command: 'tools list' }),
}).then(r => r.json());

await fetch(AGENT_OS + '/mcp', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + API_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    tool: 'agentos.mem_set',
    input: { key: 'hello', value: 'world', ttl: 3600 },
  }),
}).then(r => r.json());`}</pre>
          </div>
        </div>
      </div>

      <DocsFooter />
    </div>
  );
}

