import Link from 'next/link';
import Nav from '@/components/Nav';
import Badge from '@/components/Badge';
import FadeIn from '@/components/FadeIn';
import { APP_URL } from '@/lib/config';

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
}

// Save report
await os.fs.write('report.json', JSON.stringify(signal));`;

const BEFORE_CODE = `// Before AgentOS
const redis = new Redis(process.env.REDIS_URL);
const supabase = createClient(url, key);
const { exec } = require('child_process');

// Set up auth, rate limiting, sandboxing...
// Handle errors, timeouts, quotas...
// Write 500+ lines of infra code
// before a single line of agent logic.`;

const AFTER_CODE = `// With AgentOS
const os = new AgentOS({ apiKey: process.env.AGENT_OS_KEY });

await os.mem.set('key', value);
await os.db.insert('table', row);
await os.proc.execute(code, 'python');
// Auth, isolation, quotas — included.`;

const HERO_CODE_LINES = [
  { t: 'comment', v: "import { AgentOS } from '@agentos/sdk';" },
  { t: 'blank',   v: '' },
  { t: 'code',    v: 'const os = new AgentOS({ apiKey });' },
  { t: 'blank',   v: '' },
  { t: 'comment', v: '// net — fetch live BTC price' },
  { t: 'code',    v: 'const p = await os.net.http_get(btcUrl);' },
  { t: 'blank',   v: '' },
  { t: 'comment', v: '// mem — cache for 60s' },
  { t: 'code',    v: "await os.mem.set('btc', p.price, 60);" },
  { t: 'blank',   v: '' },
  { t: 'comment', v: '// db — persist history' },
  { t: 'code',    v: "await os.db.insert('prices', row);" },
  { t: 'blank',   v: '' },
  { t: 'comment', v: '// proc — run analysis' },
  { t: 'code',    v: "const sig = await os.proc.execute(py, 'python');" },
  { t: 'blank',   v: '' },
  { t: 'comment', v: '// events — broadcast signal' },
  { t: 'code',    v: "await os.events.publish('signals', sig);" },
  { t: 'blank',   v: '' },
  { t: 'comment', v: '// fs — save report' },
  { t: 'code',    v: "await os.fs.write('report.json', result);" },
];

const PRIMITIVES = [
  { key: 'mem', name: 'mem', label: 'Memory', desc: 'Redis-backed key-value store with TTL, namespaced per agent.', tools: ['mem_set', 'mem_get', 'mem_delete', 'mem_list', 'mem_incr'] },
  { key: 'fs', name: 'fs', label: 'Filesystem', desc: 'Cloud file storage backed by Supabase. Each agent gets isolated storage.', tools: ['fs_read', 'fs_write', 'fs_list', 'fs_delete', 'fs_mkdir'] },
  { key: 'db', name: 'db', label: 'Database', desc: 'PostgreSQL with per-agent schema isolation. Queries, transactions, DDL.', tools: ['db_query', 'db_insert', 'db_update', 'db_delete', 'db_transaction'] },
  { key: 'net', name: 'net', label: 'Network', desc: 'Outbound HTTP with SSRF protection, domain allowlisting, rate limiting.', tools: ['net_http_get', 'net_http_post', 'net_http_put', 'net_dns_resolve'] },
  { key: 'proc', name: 'proc', label: 'Process', desc: 'Sandboxed code execution: Python, JavaScript, Bash. Timeouts & quotas.', tools: ['proc_execute', 'proc_schedule', 'proc_spawn', 'proc_kill'] },
  { key: 'events', name: 'events', label: 'Events', desc: 'Redis pub/sub messaging. Publish, subscribe, coordinate across agents.', tools: ['events_publish', 'events_subscribe', 'events_list_topics'] },
];

const USE_CASES = [
  { title: 'Trading Bot', chain: 'net → mem → db → proc → events', detail: 'Fetch prices, cache data, store history, run signals, broadcast.' },
  { title: 'Research Assistant', chain: 'net → db → mem → fs', detail: 'Crawl pages, store results, cache context, export reports.' },
  { title: 'Customer Service', chain: 'db → mem → net → events', detail: 'History in db, context in mem, APIs via net, workflows via events.' },
  { title: 'Data Pipeline', chain: 'net → fs → proc → db → events', detail: 'Download, write, transform, load, notify downstream.' },
];

const MARKETPLACE_SKILLS = [
  { name: 'JSON Transformer', cat: 'Data', desc: 'Parse, filter, and reshape JSON.', slug: 'json-transformer' },
  { name: 'Text Utilities', cat: 'Documents', desc: 'Slugify, truncate, extract emails.', slug: 'text-utils' },
  { name: 'Math & Stats', cat: 'Analytics', desc: 'Mean, median, std dev, averages.', slug: 'math-stats' },
  { name: 'Date & Time', cat: 'Utilities', desc: 'Parse, format, diff, add dates.', slug: 'date-time' },
  { name: 'HTTP Builder', cat: 'Web', desc: 'Build headers, encode params.', slug: 'http-request-builder' },
  { name: 'CSV Processor', cat: 'Documents', desc: 'Parse CSV, filter rows, aggregate.', slug: 'csv-processor' },
];

export default function HomePage() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <Nav />

      {/* ── Hero ── */}
      <section style={{
        position: 'relative',
        overflow: 'hidden',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}>
        {/* Grid pattern background */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg stroke='%23222222' stroke-width='0.5'%3E%3Cpath d='M0 40L40 0M0 0l40 40'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
          maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)',
        }} />

        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '80px 24px 60px', width: '100%', position: 'relative' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '64px', alignItems: 'center' }}>
            {/* Left */}
            <div>
              <div className="animate-fade-up delay-0">
                <Badge variant="accent" style={{ marginBottom: '24px' }}>
                  Developer Infrastructure · MIT License
                </Badge>
              </div>

              <h1 className="animate-fade-up delay-200" style={{
                fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                fontSize: 'clamp(36px, 5vw, 64px)',
                fontWeight: 700,
                lineHeight: 1.05,
                color: 'var(--text-primary)',
                marginBottom: '20px',
                marginTop: '8px',
              }}>
                Operating system<br />for AI agents.
              </h1>

              <p className="animate-fade-up delay-400" style={{
                fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
                fontSize: '17px',
                color: 'var(--text-secondary)',
                lineHeight: 1.7,
                marginBottom: '36px',
                maxWidth: '520px',
              }}>
                Six production-ready primitives — filesystem, database, memory,
                network, processes, and events — secured and isolated per agent.
                Ship your agent in 5 minutes, not 5 weeks.
              </p>

              <div className="animate-fade-up delay-600" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <Link href="/signup" className="btn-primary" style={{ fontSize: '15px', padding: '12px 28px' }}>
                  Start building free →
                </Link>
                <a href="https://github.com/chrizzy-x/Agent-OS" target="_blank" rel="noopener noreferrer"
                  className="btn-outline" style={{ fontSize: '15px', padding: '12px 28px' }}>
                  View on GitHub ↗
                </a>
              </div>
            </div>

            {/* Right: hero code */}
            <div className="animate-fade-up delay-400" style={{ display: 'none' }} id="hero-code-desktop">
              <div className="terminal" style={{ fontSize: '12px' }}>
                <div className="terminal-header">
                  <div className="terminal-dot" style={{ background: '#ff5f57' }} />
                  <div className="terminal-dot" style={{ background: '#febc2e' }} />
                  <div className="terminal-dot" style={{ background: '#28c840' }} />
                  <span style={{ marginLeft: '12px', fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono), JetBrains Mono, monospace' }}>agent.ts</span>
                </div>
                <div style={{ padding: '20px', overflowX: 'auto', maxHeight: '420px', overflowY: 'auto' }}>
                  <pre style={{ margin: 0, fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '12px', lineHeight: 1.7 }}>
                    {HERO_CODE_LINES.map((line, i) => (
                      <div key={i} style={{ display: 'flex' }}>
                        <span style={{
                          userSelect: 'none',
                          marginRight: '20px',
                          textAlign: 'right',
                          minWidth: '24px',
                          color: 'var(--text-tertiary)',
                          fontSize: '11px',
                          lineHeight: 1.7,
                        }}>{line.t !== 'blank' ? i + 1 : ''}</span>
                        <span style={{ color: line.t === 'comment' ? 'var(--text-tertiary)' : line.t === 'blank' ? 'transparent' : 'var(--text-primary)' }}>
                          {line.v || ' '}
                        </span>
                      </div>
                    ))}
                    <span className="animate-cursor" style={{ color: 'var(--accent)' }}>▋</span>
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <div className="stats-bar">
        {['6 primitives', '5 min setup', 'MIT License', '90d token TTL'].map((item, i) => (
          <div key={item} className="stats-bar-item" style={{ borderLeft: i > 0 ? '1px solid var(--border)' : 'none' }}>
            {item}
          </div>
        ))}
      </div>

      {/* ── Problem / Solution ── */}
      <FadeIn>
        <section style={{ padding: '80px 0', backgroundColor: 'var(--bg-secondary)' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px' }}>
            <div style={{ marginBottom: '40px' }}>
              <Badge variant="dim" style={{ marginBottom: '16px' }}>The Problem</Badge>
              <h2 style={{
                fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                fontSize: 'clamp(24px, 3vw, 36px)',
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginBottom: '12px',
                marginTop: '8px',
              }}>Stop reinventing infrastructure</h2>
              <p style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '15px', color: 'var(--text-secondary)' }}>
                Every agent team rebuilds the same boilerplate. AgentOS ships it once.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              {/* Before */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <div style={{ width: '6px', height: '6px', background: 'var(--danger)' }} />
                  <span style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '11px', color: 'var(--danger)', letterSpacing: '0.08em' }}>WITHOUT AGENTOS</span>
                </div>
                <div style={{ background: 'rgba(255,68,68,0.04)', border: '1px solid rgba(255,68,68,0.2)', padding: '0' }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,68,68,0.15)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ff5f57' }} />
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#374151' }} />
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#374151' }} />
                    <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono), JetBrains Mono, monospace' }}>before.ts</span>
                  </div>
                  <pre style={{ margin: 0, padding: '20px', fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.7, overflowX: 'auto' }}>{BEFORE_CODE}</pre>
                </div>
              </div>

              {/* After */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <div style={{ width: '6px', height: '6px', background: 'var(--accent)' }} />
                  <span style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '11px', color: 'var(--accent)', letterSpacing: '0.08em' }}>WITH AGENTOS</span>
                </div>
                <div style={{ background: 'rgba(0,255,136,0.03)', border: '1px solid rgba(0,255,136,0.2)', padding: '0' }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(0,255,136,0.15)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--accent)' }} />
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--accent-dim)', opacity: 0.5 }} />
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--accent-dim)', opacity: 0.3 }} />
                    <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono), JetBrains Mono, monospace' }}>after.ts</span>
                  </div>
                  <pre style={{ margin: 0, padding: '20px', fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.7, overflowX: 'auto' }}>{AFTER_CODE}</pre>
                </div>
              </div>
            </div>
          </div>
        </section>
      </FadeIn>

      <div className="section-divider" />

      {/* ── Primitives ── */}
      <FadeIn>
        <section style={{ padding: '80px 0' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px' }}>
            <div style={{ marginBottom: '48px' }}>
              <Badge variant="dim" style={{ marginBottom: '16px' }}>Primitives</Badge>
              <h2 style={{
                fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                fontSize: 'clamp(24px, 3vw, 36px)',
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginBottom: '12px',
                marginTop: '8px',
              }}>6 primitives, infinite possibilities</h2>
              <p style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '15px', color: 'var(--text-secondary)' }}>
                Everything an agent needs to read, write, compute, and communicate.
              </p>
            </div>

            <div className="primitive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', border: '1px solid var(--border)', backgroundColor: 'var(--border)' }}>
              {PRIMITIVES.map(p => (
                <div key={p.key} className="hover-surface" style={{ backgroundColor: 'var(--bg-secondary)', padding: '28px', transition: 'background-color 200ms' }}
                >
                  <div style={{
                    fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'var(--accent)',
                    marginBottom: '6px',
                  }}>os.{p.name}</div>
                  <div style={{
                    fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
                    fontSize: '16px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginBottom: '10px',
                  }}>{p.label}</div>
                  <p style={{
                    fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.6,
                    marginBottom: '16px',
                  }}>{p.desc}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {p.tools.map(t => <span key={t} className="tag">{t}</span>)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </FadeIn>

      <div className="section-divider" />

      {/* ── Full code example ── */}
      <FadeIn>
        <section style={{ padding: '80px 0', backgroundColor: 'var(--bg-secondary)' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px' }}>
            <div style={{ marginBottom: '40px' }}>
              <Badge variant="dim" style={{ marginBottom: '16px' }}>Live Example</Badge>
              <h2 style={{
                fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                fontSize: 'clamp(24px, 3vw, 36px)',
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginBottom: '12px',
                marginTop: '8px',
              }}>See all 6 in 40 lines</h2>
              <p style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '15px', color: 'var(--text-secondary)' }}>
                A trading agent that monitors BTC and broadcasts buy signals.
              </p>
            </div>

            <div style={{ background: 'var(--code-bg)', border: '1px solid var(--code-border)', maxWidth: '800px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--code-border)', background: 'var(--bg-secondary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ff5f57' }} />
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#febc2e' }} />
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#28c840' }} />
                  <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono), JetBrains Mono, monospace' }}>trading-agent.ts</span>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono), JetBrains Mono, monospace' }}>TypeScript</span>
              </div>
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <pre style={{ margin: 0, padding: '24px', fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '13px', lineHeight: 1.7, color: 'var(--text-primary)' }}>{CODE_EXAMPLE}</pre>
              </div>
            </div>
          </div>
        </section>
      </FadeIn>

      <div className="section-divider" />

      {/* ── Use Cases ── */}
      <FadeIn>
        <section style={{ padding: '80px 0' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px' }}>
            <div style={{ marginBottom: '48px' }}>
              <Badge variant="dim" style={{ marginBottom: '16px' }}>Use Cases</Badge>
              <h2 style={{
                fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                fontSize: 'clamp(24px, 3vw, 36px)',
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginBottom: '12px',
                marginTop: '8px',
              }}>What people build</h2>
              <p style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '15px', color: 'var(--text-secondary)' }}>
                Agents that run autonomously in production.
              </p>
            </div>

            <div className="use-case-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', border: '1px solid var(--border)', backgroundColor: 'var(--border)' }}>
              {USE_CASES.map(uc => (
                <div key={uc.title} style={{ backgroundColor: 'var(--bg-secondary)', padding: '28px' }}>
                  <h3 style={{
                    fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                    fontSize: '16px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginBottom: '8px',
                    marginTop: 0,
                  }}>{uc.title}</h3>
                  <p style={{
                    fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                    fontSize: '12px',
                    color: 'var(--text-secondary)',
                    marginBottom: '10px',
                    letterSpacing: '0.02em',
                  }}>{uc.chain}</p>
                  <p style={{
                    fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.6,
                    margin: 0,
                  }}>{uc.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </FadeIn>

      <div className="section-divider" />

      {/* ── Marketplace ── */}
      <FadeIn>
        <section style={{ padding: '80px 0', backgroundColor: 'var(--bg-secondary)' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '40px', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <Badge variant="dim" style={{ marginBottom: '16px' }}>Marketplace</Badge>
                <h2 style={{
                  fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                  fontSize: 'clamp(22px, 2.5vw, 32px)',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  marginBottom: '8px',
                  marginTop: '8px',
                }}>Skills Marketplace</h2>
                <p style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '15px', color: 'var(--text-secondary)', margin: 0 }}>
                  Community-built capabilities. Install only what you need.
                </p>
              </div>
              <Link href="/marketplace" className="btn-ghost" style={{ fontSize: '13px', padding: '8px 16px' }}>Browse all →</Link>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', border: '1px solid var(--border)', backgroundColor: 'var(--border)', marginBottom: '24px' }}>
              {MARKETPLACE_SKILLS.map(s => (
                <Link key={s.slug} href={`/marketplace/${s.slug}`} className="hover-surface" style={{
                  display: 'block',
                  backgroundColor: 'var(--bg-primary)',
                  padding: '24px',
                  textDecoration: 'none',
                  transition: 'background-color 200ms',
                }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <span style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '10px', color: 'var(--text-tertiary)', letterSpacing: '0.06em' }}>{s.cat}</span>
                    <span style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '11px', color: 'var(--accent)' }}>Free</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>{s.name}</div>
                  <div style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '13px', color: 'var(--text-secondary)' }}>{s.desc}</div>
                </Link>
              ))}
            </div>

            {/* Developer CTA */}
            <div style={{
              padding: '28px 32px',
              border: '1px solid var(--border-active)',
              backgroundColor: 'var(--bg-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px',
            }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Build skills. Earn 70% revenue share.
                </div>
                <p style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                  Publish to the marketplace and earn from every API call your skill handles.
                </p>
              </div>
              <Link href="/developer" className="btn-primary" style={{ flexShrink: 0, fontSize: '13px', padding: '10px 20px' }}>
                Developer Dashboard →
              </Link>
            </div>
          </div>
        </section>
      </FadeIn>

      <div className="section-divider" />

      {/* ── CTA ── */}
      <FadeIn>
        <section style={{ padding: '100px 0', position: 'relative', overflow: 'hidden' }}>
          {/* Subtle accent glow */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '600px',
            height: '300px',
            background: 'radial-gradient(ellipse, rgba(0,255,136,0.06) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />
          <div style={{ maxWidth: '640px', margin: '0 auto', padding: '0 24px', textAlign: 'center', position: 'relative' }}>
            <h2 style={{
              fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
              fontSize: 'clamp(28px, 4vw, 48px)',
              fontWeight: 700,
              color: 'var(--text-primary)',
              lineHeight: 1.1,
              marginBottom: '20px',
            }}>Ship your agent<br />in 5 minutes.</h2>
            <p style={{
              fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
              fontSize: '16px',
              color: 'var(--text-secondary)',
              lineHeight: 1.7,
              marginBottom: '40px',
            }}>
              Create your agent account, get your API key, and start using all 6 primitives immediately.
              No credit card. No infra setup.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/signup" className="btn-primary" style={{ fontSize: '15px', padding: '14px 32px' }}>Get started free →</Link>
              <a href="https://github.com/chrizzy-x/Agent-OS" target="_blank" rel="noopener noreferrer"
                className="btn-outline" style={{ fontSize: '15px', padding: '14px 32px' }}>View on GitHub ↗</a>
            </div>
          </div>
        </section>
      </FadeIn>

      {/* ── Footer ── */}
      <footer style={{ borderTop: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '24px', height: '24px', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '12px', color: 'var(--accent)', fontWeight: 700 }}>A</div>
            <span style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>AgentOS</span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0' }}>
            {[
              { href: 'https://github.com/chrizzy-x/Agent-OS', label: 'GitHub', external: true },
              { href: '/marketplace', label: 'Marketplace', external: false },
              { href: '/connect', label: 'Connect', external: false },
              { href: '/docs', label: 'Docs', external: false },
              { href: '/developer', label: 'Developer', external: false },
              { href: '/token', label: 'Token', external: false },
            ].map(link => link.external ? (
              <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer"
                className="hover-text-secondary"
                style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '13px', color: 'var(--text-tertiary)', textDecoration: 'none', padding: '4px 12px', transition: 'color 150ms' }}
              >{link.label}</a>
            ) : (
              <Link key={link.label} href={link.href}
                className="hover-text-secondary"
                style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '13px', color: 'var(--text-tertiary)', textDecoration: 'none', padding: '4px 12px', transition: 'color 150ms' }}
              >{link.label}</Link>
            ))}
          </div>

          <span style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '12px', color: 'var(--text-tertiary)' }}>
            MIT License · {new Date().getFullYear()}
          </span>
        </div>
      </footer>

      {/* Responsive hero code block — show on desktop */}
      <style>{`
        @media (min-width: 1024px) {
          #hero-code-desktop { display: block !important; }
        }
        @media (max-width: 1023px) {
          .primitive-grid { grid-template-columns: 1fr 1fr !important; }
          .use-case-grid { grid-template-columns: 1fr !important; }
          section > div > div[style*="grid-template-columns: 1fr 1fr"] {
            grid-template-columns: 1fr !important;
          }
          section > div > div[style*="grid-template-columns: repeat(3"] {
            grid-template-columns: 1fr 1fr !important;
          }
        }
        @media (max-width: 640px) {
          .primitive-grid { grid-template-columns: 1fr !important; }
          section > div > div[style*="grid-template-columns: repeat(3"] {
            grid-template-columns: 1fr !important;
          }
          .stats-bar-item { padding: 4px 16px !important; }
        }
      `}</style>
    </div>
  );
}
