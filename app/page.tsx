import Link from 'next/link';
import CodeBlock from '@/components/CodeBlock';
import { APP_URL } from '@/lib/config';
import { FeatureShowcase } from '@/components/FeatureShowcase';

const CODE_EXAMPLE = `import { AgentOS } from '@agentos/sdk';

const os = new AgentOS({
  apiUrl: '${APP_URL}',
  apiKey: process.env.AGENT_OS_KEY
});

// Monitor Bitcoin price
const price = await os.net.http_get(
  'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT'
);

// Cache for 60 seconds
await os.mem.set('btc_price', price.data.price, 60);

// Store in database
await os.db.insert('prices', {
  symbol: 'BTC',
  price: parseFloat(price.data.price),
  timestamp: Date.now()
});

// Run analysis
const signal = await os.proc.execute(\`
import numpy as np
prices = \${JSON.stringify(priceHistory)}
rsi = calculate_rsi(prices)
print('BUY' if rsi < 30 else 'HOLD')
\`, 'python');

// Publish event
if (signal.output === 'BUY') {
  await os.events.publish('trading.signals', {
    symbol: 'BTC',
    action: 'BUY',
    price: price.data.price
  });
}`;

const BEFORE_CODE = `// Before Agent OS
const redis = new Redis(process.env.REDIS_URL);
const supabase = createClient(url, key);
const { exec } = require('child_process');

// Set up auth, rate limiting, sandboxing...
// Handle errors, timeouts, quotas...
// Write 500+ lines of infra code
// before a single line of agent logic.`;

const AFTER_CODE = `// With Agent OS
const os = new AgentOS({ apiKey: process.env.AGENT_OS_KEY });

await os.mem.set('key', value);
await os.db.insert('table', row);
await os.proc.execute(code, 'python');
// Auth, isolation, quotas — included.`;

const PRIMITIVES = [
  {
    key: 'mem',
    name: 'mem',
    label: 'Memory',
    color: '#a855f7',
    desc: 'Redis-backed key-value store with TTL, namespaced per agent.',
    tools: ['mem_set', 'mem_get', 'mem_delete', 'mem_list', 'mem_incr'],
    icon: (
      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
        <circle cx="8" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="16" cy="12" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    key: 'fs',
    name: 'fs',
    label: 'Filesystem',
    color: '#06b6d4',
    desc: 'Cloud file storage backed by Supabase. Each agent gets isolated storage.',
    tools: ['fs_read', 'fs_write', 'fs_list', 'fs_delete', 'fs_mkdir'],
    icon: (
      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
      </svg>
    ),
  },
  {
    key: 'db',
    name: 'db',
    label: 'Database',
    color: '#3b82f6',
    desc: 'PostgreSQL with per-agent schema isolation. Queries, transactions, DDL.',
    tools: ['db_query', 'db_insert', 'db_update', 'db_delete', 'db_transaction'],
    icon: (
      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path strokeLinecap="round" d="M3 5v14c0 1.657 4.03 3 9 3s9-1.343 9-3V5" />
        <path strokeLinecap="round" d="M3 12c0 1.657 4.03 3 9 3s9-1.343 9-3" />
      </svg>
    ),
  },
  {
    key: 'net',
    name: 'net',
    label: 'Network',
    color: '#22c55e',
    desc: 'Outbound HTTP with SSRF protection, domain allowlisting, rate limiting.',
    tools: ['net_http_get', 'net_http_post', 'net_http_put', 'net_dns_resolve'],
    icon: (
      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" d="M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 010 18M12 3a15 15 0 000 18" />
      </svg>
    ),
  },
  {
    key: 'proc',
    name: 'proc',
    label: 'Process',
    color: '#f59e0b',
    desc: 'Sandboxed code execution: Python, JavaScript, Bash. Timeouts & quotas.',
    tools: ['proc_execute', 'proc_schedule', 'proc_spawn', 'proc_kill'],
    icon: (
      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    key: 'events',
    name: 'events',
    label: 'Events',
    color: '#ec4899',
    desc: 'Redis pub/sub messaging. Publish, subscribe, coordinate across agents.',
    tools: ['events_publish', 'events_subscribe', 'events_list_topics'],
    icon: (
      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.82m5.84-2.56a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.63 2v5.84m5.96 6.53H3" />
      </svg>
    ),
  },
];

const USE_CASES = [
  { title: 'Trading Bot', desc: 'net → mem → db → proc → events', detail: 'Fetch prices, cache data, store history, run signals, broadcast.' },
  { title: 'Research Assistant', desc: 'net → db → mem → fs', detail: 'Crawl pages, store results, cache context, export reports.' },
  { title: 'Customer Service', desc: 'db → mem → net → events', detail: 'History in db, context in mem, APIs via net, workflows via events.' },
  { title: 'Data Pipeline', desc: 'net → fs → proc → db → events', detail: 'Download, write, transform, load, notify downstream.' },
];

export default function HomePage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--text)' }}>

      {/* ── Nav ── */}
      <nav style={{ borderBottom: '1px solid var(--border)', background: 'rgba(3,3,10,0.85)', backdropFilter: 'blur(16px)' }}
        className="sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-5 py-3.5 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black font-mono"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', boxShadow: '0 0 12px rgba(124,58,237,0.5)' }}>
              A
            </div>
            <span className="font-mono font-bold text-sm tracking-wide" style={{ color: 'var(--text)' }}>
              Agent<span className="gradient-text">OS</span>
            </span>
          </div>
          {/* Links */}
          <div className="hidden md:flex items-center gap-6 text-sm" style={{ color: 'var(--text-muted)' }}>
            <Link href="/marketplace" className="hover:text-white transition-colors">Marketplace</Link>
            <Link href="/connect" className="hover:text-white transition-colors">Connect Your Agent</Link>
            <Link href="/docs" className="hover:text-white transition-colors">Docs</Link>
            <Link href="/developer" className="hover:text-white transition-colors">Developers</Link>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/signin" className="btn-outline text-sm px-4 py-2 rounded-lg">Sign in</Link>
            <Link href="/signup" className="btn-primary text-sm px-4 py-2 rounded-lg">Get started</Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-grid">
        {/* Background orbs */}
        <div className="orb w-[600px] h-[600px] top-[-200px] left-[-100px]"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)' }} />
        <div className="orb w-[500px] h-[500px] top-[-100px] right-[-150px]"
          style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.1) 0%, transparent 70%)' }} />

        <div className="relative max-w-6xl mx-auto px-5 pt-24 pb-20">
          <div className="grid lg:grid-cols-[1fr_1fr] gap-12 items-center">
            {/* Left: copy */}
            <div>
              <div className="badge badge-purple mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-glow" />
                Open source · MIT License
              </div>

              <h1 className="text-5xl sm:text-6xl font-black leading-[1.05] mb-5 tracking-tight">
                <span className="gradient-text">Operating system</span>
                <br />
                <span style={{ color: 'var(--text)' }}>for AI agents.</span>
              </h1>

              <p className="text-lg mb-3" style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>
                Six production-ready primitives — filesystem, database, memory,
                network, processes, and events — secured and isolated per agent.
              </p>

              <p className="font-mono text-sm mb-10" style={{ color: '#a855f7' }}>
                <span>6 primitives</span>
                <span style={{ color: 'var(--text-dim)' }}> · </span>
                <span style={{ color: '#06b6d4' }}>5 minutes</span>
                <span style={{ color: 'var(--text-dim)' }}> · </span>
                <span style={{ color: '#22c55e' }}>production ready</span>
                <span className="animate-cursor ml-0.5" style={{ color: '#a855f7' }}>▋</span>
              </p>

              <div className="flex flex-wrap gap-3">
                <Link href="/signup" className="btn-primary px-6 py-3 rounded-lg text-base">
                  Start building free →
                </Link>
                <a href="https://github.com/chrizzy-x/Agent-OS" target="_blank" rel="noopener noreferrer"
                  className="btn-outline px-6 py-3 rounded-lg text-base flex items-center gap-2">
                  <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                  Star on GitHub
                </a>
              </div>

              {/* Stats row */}
              <div className="flex gap-8 mt-10 pt-10" style={{ borderTop: '1px solid var(--border)' }}>
                {[
                  { val: '6', label: 'primitives' },
                  { val: '90d', label: 'token TTL' },
                  { val: 'MIT', label: 'license' },
                ].map(s => (
                  <div key={s.label}>
                    <div className="text-2xl font-black font-mono gradient-text">{s.val}</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: terminal window */}
            <div className="animate-float">
              <div className="terminal glow-purple">
                <div className="terminal-header">
                  <div className="terminal-dot" style={{ background: '#ef4444' }} />
                  <div className="terminal-dot" style={{ background: '#f59e0b' }} />
                  <div className="terminal-dot" style={{ background: '#22c55e' }} />
                  <span className="ml-3 text-xs" style={{ color: 'var(--text-dim)' }}>agent.ts</span>
                </div>
                <div className="p-5 overflow-auto" style={{ maxHeight: '380px' }}>
                  <pre className="text-xs leading-relaxed" style={{ fontFamily: 'inherit' }}>
{[
  { t: 'comment', v: '// All 6 primitives in one agent' },
  { t: 'blank', v: '' },
  { t: 'import', v: "import { AgentOS } from '@agentos/sdk';" },
  { t: 'blank', v: '' },
  { t: 'const',  v: 'const os = new AgentOS({ apiKey });' },
  { t: 'blank', v: '' },
  { t: 'comment', v: '// net — fetch live BTC price' },
  { t: 'code',   v: "const p = await os.net.http_get(btcUrl);" },
  { t: 'blank', v: '' },
  { t: 'comment', v: '// mem — cache for 60s' },
  { t: 'code',   v: "await os.mem.set('btc', p.price, 60);" },
  { t: 'blank', v: '' },
  { t: 'comment', v: '// db — persist history' },
  { t: 'code',   v: "await os.db.insert('prices', row);" },
  { t: 'blank', v: '' },
  { t: 'comment', v: '// proc — run analysis' },
  { t: 'code',   v: "const sig = await os.proc.execute(py, 'python');" },
  { t: 'blank', v: '' },
  { t: 'comment', v: '// events — broadcast signal' },
  { t: 'code',   v: "await os.events.publish('signals', sig);" },
  { t: 'blank', v: '' },
  { t: 'comment', v: '// fs — save report' },
  { t: 'code',   v: "await os.fs.write('report.json', result);" },
].map((line, i) => (
  <div key={i} className="flex">
    <span className="select-none mr-4 text-right w-4" style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>{line.t !== 'blank' ? i + 1 : ''}</span>
    <span style={{
      color: line.t === 'comment' ? '#475569'
           : line.t === 'import'  ? '#a78bfa'
           : line.t === 'const'   ? '#67e8f9'
           : '#e2e8f0'
    }}>{line.v}</span>
  </div>
))}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="section-divider" />

      {/* ── Problem / Solution ── */}
      <section className="relative py-20" style={{ background: 'var(--surface)' }}>
        <div className="max-w-6xl mx-auto px-5">
          <div className="text-center mb-14">
            <div className="badge badge-cyan inline-flex mb-4">The problem</div>
            <h2 className="text-3xl sm:text-4xl font-black mb-3">Stop reinventing infrastructure</h2>
            <p style={{ color: 'var(--text-muted)' }}>Every agent team rebuilds the same boilerplate. Agent OS ships it once.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full" style={{ background: '#ef4444' }} />
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#f87171' }}>Before Agent OS</span>
              </div>
              <div className="terminal" style={{ borderColor: 'rgba(239,68,68,0.2)' }}>
                <div className="terminal-header">
                  <div className="terminal-dot" style={{ background: '#ef4444' }} />
                  <div className="terminal-dot" style={{ background: '#374151' }} />
                  <div className="terminal-dot" style={{ background: '#374151' }} />
                  <span className="ml-3 text-xs" style={{ color: 'var(--text-dim)' }}>before.ts</span>
                </div>
                <div className="p-5">
                  <CodeBlock code={BEFORE_CODE} language="typescript" />
                </div>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full" style={{ background: '#22c55e' }} />
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#86efac' }}>With Agent OS</span>
              </div>
              <div className="terminal" style={{ borderColor: 'rgba(34,197,94,0.2)' }}>
                <div className="terminal-header">
                  <div className="terminal-dot" style={{ background: '#22c55e' }} />
                  <div className="terminal-dot" style={{ background: '#22c55e', opacity: 0.5 }} />
                  <div className="terminal-dot" style={{ background: '#22c55e', opacity: 0.3 }} />
                  <span className="ml-3 text-xs" style={{ color: 'var(--text-dim)' }}>after.ts</span>
                </div>
                <div className="p-5">
                  <CodeBlock code={AFTER_CODE} language="typescript" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="section-divider" />

      {/* ── Primitives ── */}
      <section className="relative py-20 bg-grid-sm overflow-hidden">
        <div className="orb w-96 h-96 top-20 right-[-100px]"
          style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)' }} />
        <div className="max-w-6xl mx-auto px-5 relative">
          <div className="text-center mb-14">
            <div className="badge badge-purple inline-flex mb-4">Primitives</div>
            <h2 className="text-3xl sm:text-4xl font-black mb-3">6 primitives, infinite possibilities</h2>
            <p style={{ color: 'var(--text-muted)' }}>Everything an agent needs to read, write, compute, and communicate.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PRIMITIVES.map((p) => (
              <div key={p.key} className={`card prim-${p.key} p-5 cursor-default`}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: `${p.color}15`, border: `1px solid ${p.color}30`, color: p.color }}>
                    {p.icon}
                  </div>
                  <div>
                    <div className="font-mono font-bold text-sm" style={{ color: p.color }}>os.{p.name}</div>
                    <div className="text-xs" style={{ color: 'var(--text-dim)' }}>{p.label}</div>
                  </div>
                </div>
                <p className="text-sm mb-4" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>{p.desc}</p>
                <div className="flex flex-wrap gap-1.5">
                  {p.tools.map(t => (
                    <span key={t} className="font-mono text-xs px-2 py-0.5 rounded"
                      style={{ background: `${p.color}10`, color: p.color, border: `1px solid ${p.color}20` }}>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="section-divider" />

      {/* ── Full code example ── */}
      <section className="py-20" style={{ background: 'var(--surface)' }}>
        <div className="max-w-6xl mx-auto px-5">
          <div className="text-center mb-12">
            <div className="badge badge-amber inline-flex mb-4">Live example</div>
            <h2 className="text-3xl sm:text-4xl font-black mb-3">See all 6 in 40 lines</h2>
            <p style={{ color: 'var(--text-muted)' }}>A trading agent that monitors BTC and broadcasts buy signals.</p>
          </div>
          <div className="terminal glow-purple max-w-3xl mx-auto">
            <div className="terminal-header">
              <div className="terminal-dot" style={{ background: '#ef4444' }} />
              <div className="terminal-dot" style={{ background: '#f59e0b' }} />
              <div className="terminal-dot" style={{ background: '#22c55e' }} />
              <span className="ml-auto text-xs" style={{ color: 'var(--text-dim)' }}>trading-agent.ts</span>
            </div>
            <div className="p-6">
              <CodeBlock code={CODE_EXAMPLE} language="typescript" />
            </div>
          </div>
        </div>
      </section>

      <div className="section-divider" />

      {/* ── Use Cases ── */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-5">
          <div className="text-center mb-14">
            <div className="badge badge-green inline-flex mb-4">Use cases</div>
            <h2 className="text-3xl sm:text-4xl font-black mb-3">What people build</h2>
            <p style={{ color: 'var(--text-muted)' }}>Agents that run autonomously in production.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {USE_CASES.map((uc) => (
              <div key={uc.title} className="card p-6">
                <h3 className="font-bold text-lg mb-1">{uc.title}</h3>
                <p className="font-mono text-xs mb-3" style={{ color: '#a855f7' }}>{uc.desc}</p>
                <p className="text-sm" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>{uc.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="section-divider" />

      {/* ── Marketplace ── */}
      <section className="py-20" style={{ background: 'var(--surface)' }}>
        <div className="max-w-6xl mx-auto px-5">
          <div className="flex items-end justify-between mb-10">
            <div>
              <div className="badge badge-purple mb-3">Marketplace</div>
              <h2 className="text-3xl font-black">Skills Marketplace</h2>
              <p className="mt-2" style={{ color: 'var(--text-muted)' }}>Community-built capabilities. Install only what you need.</p>
            </div>
            <Link href="/marketplace" className="btn-outline px-4 py-2 rounded-lg text-sm hidden sm:block">
              Browse all →
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {[
              { color: '#a855f7', name: 'JSON Transformer', cat: 'Data', desc: 'Parse, filter, and reshape JSON.', slug: 'json-transformer' },
              { color: '#06b6d4', name: 'Text Utilities', cat: 'Documents', desc: 'Slugify, truncate, extract emails.', slug: 'text-utils' },
              { color: '#3b82f6', name: 'Math & Stats', cat: 'Analytics', desc: 'Mean, median, std dev, averages.', slug: 'math-stats' },
              { color: '#22c55e', name: 'Date & Time', cat: 'Utilities', desc: 'Parse, format, diff, add dates.', slug: 'date-time' },
              { color: '#f59e0b', name: 'HTTP Builder', cat: 'Web', desc: 'Build headers, encode params.', slug: 'http-request-builder' },
              { color: '#ec4899', name: 'CSV Processor', cat: 'Documents', desc: 'Parse CSV, filter rows, aggregate.', slug: 'csv-processor' },
            ].map(s => (
              <Link key={s.slug} href={`/marketplace/${s.slug}`}
                className="card p-5 block group">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-8 h-8 rounded-lg"
                    style={{ background: `${s.color}15`, border: `1px solid ${s.color}25` }} />
                  <span className="text-xs px-2 py-0.5 rounded"
                    style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                    {s.cat}
                  </span>
                </div>
                <div className="font-semibold text-sm mb-1 group-hover:text-purple-400 transition-colors">{s.name}</div>
                <div className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>{s.desc}</div>
                <div className="text-xs font-semibold" style={{ color: '#22c55e' }}>Free</div>
              </Link>
            ))}
          </div>
          {/* Developer CTA */}
          <div className="rounded-xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
            style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.15), rgba(6,182,212,0.08))', border: '1px solid rgba(139,92,246,0.25)' }}>
            <div>
              <p className="font-bold mb-1">Build skills. Earn 70% revenue share.</p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Publish to the marketplace and earn from every API call your skill handles.
              </p>
            </div>
            <Link href="/developer" className="btn-primary px-5 py-2.5 rounded-lg text-sm flex-shrink-0">
              Developer Dashboard →
            </Link>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative py-24 overflow-hidden">
        <div className="orb w-[800px] h-[400px] top-[-100px] left-1/2 -translate-x-1/2"
          style={{ background: 'radial-gradient(ellipse, rgba(124,58,237,0.18) 0%, transparent 70%)' }} />
        <div className="orb w-[400px] h-[400px] bottom-[-150px] left-[-100px]"
          style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 70%)' }} />
        <div className="relative max-w-3xl mx-auto px-5 text-center">
          <h2 className="text-4xl sm:text-5xl font-black mb-5">
            <span className="gradient-text">Ship your agent</span>
            <br />
            <span>in 5 minutes.</span>
          </h2>
          <p className="text-lg mb-10" style={{ color: 'var(--text-muted)' }}>
            Create your agent account, get your API key, and start using all 6 primitives immediately.
            No credit card. No infra setup.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/signup" className="btn-primary px-8 py-3.5 rounded-lg text-base">
              Get started free →
            </Link>
            <a href="https://github.com/chrizzy-x/Agent-OS" target="_blank" rel="noopener noreferrer"
              className="btn-outline px-8 py-3.5 rounded-lg text-base">
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* ── Feature Showcase ── */}
      <section className="max-w-6xl mx-auto px-5 py-24">
        <FeatureShowcase />
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div className="max-w-6xl mx-auto px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded flex items-center justify-center text-xs font-black font-mono"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>A</div>
            <span className="font-mono font-bold text-sm">Agent<span className="gradient-text">OS</span></span>
          </div>
          <div className="flex items-center gap-6 text-sm" style={{ color: 'var(--text-muted)' }}>
            <a href="https://github.com/chrizzy-x/Agent-OS" className="hover:text-white transition-colors" target="_blank" rel="noopener noreferrer">GitHub</a>
            <Link href="/marketplace" className="hover:text-white transition-colors">Marketplace</Link>
            <Link href="/connect" className="hover:text-white transition-colors">Connect Your Agent</Link>
            <Link href="/docs" className="hover:text-white transition-colors">Docs</Link>
            <Link href="/developer" className="hover:text-white transition-colors">Developer</Link>
            <Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
          </div>
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>MIT License · {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}


