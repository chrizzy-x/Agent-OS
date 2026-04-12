import Link from 'next/link';
import Nav from '@/components/Nav';
import DocsFooter from '@/components/DocsFooter';
import Badge from '@/components/Badge';
import { APP_URL } from '@/lib/config';

const sections = [
  {
    title: 'Complete Guide',
    href: '/docs/guide',
    desc: 'Plain-English walkthrough from zero to running — real use cases, every feature explained, no experience needed.',
    badge: 'Start here',
  },
  {
    title: 'Quick Start',
    href: '/docs/sdk',
    desc: 'Create your agent, get credentials, make your first API call, and access your dashboard — all in under 5 minutes.',
    badge: null,
  },
  {
    title: 'Templates',
    href: '/docs/templates',
    desc: 'Copy, paste your API key, change 1–2 lines. Price alerts, research agents, portfolio trackers — done in 5 min.',
    badge: 'New',
  },
  {
    title: 'API Reference',
    href: '/docs/api',
    desc: 'Live route contracts for signup, signin, Studio, MCP, skills, workflows, kernel, and ops.',
    badge: null,
  },
  {
    title: 'Connect Your Agent',
    href: '/connect',
    desc: 'Register any external agent, capture its bearer token once, and test the universal MCP endpoint live.',
    badge: null,
  },
  {
    title: 'Primitives',
    href: '/docs/primitives',
    desc: 'Deep dive into mem, fs, db, net, proc, and events — all 30 tools.',
    badge: null,
  },
  {
    title: 'Skills',
    href: '/docs/skills',
    desc: 'Install marketplace skills, publish your own, and meter usage.',
    badge: null,
  },
  {
    title: 'FFP / Consensus Mode',
    href: '/docs/ffp',
    desc: 'Immutable audit trail and multi-party consensus for critical operations. View your audit history in the dashboard.',
    badge: 'Advanced',
  },
  {
    title: 'Launch Notes',
    href: '/docs/launch',
    desc: 'v5 Ares — FFP Multi-Chain Router. v4 Hermes — NL Studio, Workflow Library, SDK Kernel.',
    badge: 'v5 Ares',
  },
];

const primitives = [
  { name: 'mem', tools: ['mem_set', 'mem_get', 'mem_delete', 'mem_list', 'mem_incr', 'mem_expire'] },
  { name: 'fs', tools: ['fs_write', 'fs_read', 'fs_list', 'fs_delete', 'fs_mkdir', 'fs_stat'] },
  { name: 'db', tools: ['db_query', 'db_insert', 'db_update', 'db_delete', 'db_create_table', 'db_transaction'] },
  { name: 'net', tools: ['net_http_get', 'net_http_post', 'net_http_put', 'net_http_delete', 'net_dns_resolve'] },
  { name: 'proc', tools: ['proc_execute', 'proc_schedule', 'proc_spawn', 'proc_kill', 'proc_list'] },
  { name: 'events', tools: ['events_publish', 'events_subscribe', 'events_unsubscribe', 'events_list_topics'] },
];

const sidebarLinks = [
  { label: 'Overview', href: '/docs' },
  { label: 'Complete Guide', href: '/docs/guide' },
  { label: 'Quick Start', href: '/docs/sdk' },
  { label: 'Templates', href: '/docs/templates' },
  { label: 'API Reference', href: '/docs/api' },
  { label: 'Primitives', href: '/docs/primitives' },
  { label: 'Skills', href: '/docs/skills' },
  { label: 'FFP / Consensus', href: '/docs/ffp' },
  { label: 'Audit Trail', href: '/docs/audit' },
  { label: 'Launch Notes', href: '/docs/launch' },
  { label: 'Features', href: '/docs/features' },
];

export default function DocsPage() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)' }}>
      <Nav activePath="/docs" />

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px' }}>
        <div style={{ display: 'flex', gap: '48px', paddingTop: '40px' }}>

          {/* Left sidebar */}
          <aside style={{
            width: '200px',
            flexShrink: 0,
            position: 'sticky',
            top: '72px',
            alignSelf: 'flex-start',
            maxHeight: 'calc(100vh - 80px)',
            overflowY: 'auto',
          }}>
            <div style={{
              fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
              fontSize: '10px',
              fontWeight: 600,
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: '8px',
              padding: '0 12px',
            }}>Documentation</div>
            {sidebarLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={link.href !== '/docs' ? 'hover-sidebar-link' : ''}
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
                  fontSize: '13px',
                  color: link.href === '/docs' ? 'var(--accent)' : 'var(--text-secondary)',
                  textDecoration: 'none',
                  padding: '7px 12px',
                  borderLeft: link.href === '/docs' ? '2px solid var(--accent)' : '2px solid transparent',
                  transition: 'color 150ms, border-color 150ms',
                  marginBottom: '1px',
                }}
              >
                {link.label}
              </Link>
            ))}
          </aside>

          {/* Main content */}
          <main style={{ flex: 1, minWidth: 0, paddingBottom: '80px' }}>
            {/* Header */}
            <div style={{ marginBottom: '48px' }}>
              <Badge variant="accent" style={{ marginBottom: '16px' }}>Reference</Badge>
              <h1 style={{
                fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                fontSize: '36px',
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginBottom: '12px',
                marginTop: '12px',
                lineHeight: 1.15,
              }}>Documentation</h1>
              <p style={{
                fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
                fontSize: '17px',
                color: 'var(--text-secondary)',
                maxWidth: '560px',
              }}>
                Live developer docs for building, operating, and extending autonomous agents on AgentOS.
              </p>
            </div>

            {/* Sections grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '1px',
              marginBottom: '56px',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--border)',
            }}>
              {sections.map(section => (
                <Link
                  key={section.href}
                  href={section.href}
                  style={{
                    display: 'block',
                    padding: '24px',
                    backgroundColor: 'var(--bg-secondary)',
                    textDecoration: 'none',
                    transition: 'background-color 200ms',
                  }}
                  className="hover-surface"
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '10px', gap: '8px' }}>
                    <span style={{
                      fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                      fontSize: '10px',
                      color: 'var(--text-tertiary)',
                    }}>{section.href}</span>
                    {section.badge && <Badge variant="accent">{section.badge}</Badge>}
                  </div>
                  <h2 style={{
                    fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                    fontSize: '15px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginBottom: '8px',
                    marginTop: 0,
                  }}>{section.title}</h2>
                  <p style={{
                    fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.6,
                    margin: 0,
                  }}>{section.desc}</p>
                </Link>
              ))}
            </div>

            {/* 6 primitives at a glance */}
            <h2 style={{
              fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
              fontSize: '22px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: '20px',
            }}>6 primitives at a glance</h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: '1px',
              marginBottom: '56px',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--border)',
            }}>
              {primitives.map(primitive => (
                <Link
                  key={primitive.name}
                  href={`/docs/primitives#${primitive.name}`}
                  style={{
                    display: 'block',
                    padding: '20px',
                    backgroundColor: 'var(--bg-secondary)',
                    textDecoration: 'none',
                    transition: 'background-color 200ms',
                  }}
                  className="hover-surface"
                >
                  <code style={{
                    fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                    fontWeight: 600,
                    fontSize: '14px',
                    color: 'var(--accent)',
                    display: 'block',
                    marginBottom: '12px',
                  }}>os.{primitive.name}</code>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {primitive.tools.map(tool => (
                      <span key={tool} className="tag">{tool}</span>
                    ))}
                  </div>
                </Link>
              ))}
            </div>

            {/* Base URL */}
            <div style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              padding: '24px',
              marginBottom: '32px',
            }}>
              <h3 style={{
                fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                marginBottom: '12px',
                marginTop: 0,
              }}>Base URL</h3>
              <code style={{
                display: 'block',
                fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                fontSize: '13px',
                color: 'var(--accent)',
                backgroundColor: 'var(--code-bg)',
                border: '1px solid var(--code-border)',
                padding: '10px 14px',
                marginBottom: '12px',
              }}>{APP_URL}</code>
              <p style={{
                fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
                fontSize: '13px',
                color: 'var(--text-secondary)',
                margin: 0,
              }}>All API requests use this base URL. Authenticate with your Bearer token.</p>
            </div>

            {/* 30-second example */}
            <div className="terminal">
              <div className="terminal-header">
                <div className="terminal-dot" style={{ background: '#ff5f57' }} />
                <div className="terminal-dot" style={{ background: '#febc2e' }} />
                <div className="terminal-dot" style={{ background: '#28c840' }} />
                <span style={{ marginLeft: '12px', fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono), JetBrains Mono, monospace' }}>30-second example</span>
                <div style={{ marginLeft: 'auto' }}>
                  <Link href="/studio" style={{ fontSize: '11px', color: 'var(--accent)', textDecoration: 'none', fontFamily: 'var(--font-mono), JetBrains Mono, monospace' }}>
                    Open Studio →
                  </Link>
                </div>
              </div>
              <div style={{ padding: '20px' }}>
                <pre style={{
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                  lineHeight: '1.7',
                  color: 'var(--text-secondary)',
                  overflowX: 'auto',
                  margin: 0,
                }}>{`const AGENT_OS = '${APP_URL}';
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
          </main>
        </div>
      </div>

      <DocsFooter />
    </div>
  );
}
