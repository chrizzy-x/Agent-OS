import Link from 'next/link';
import DocsFooter from '@/components/DocsFooter';
import { APP_URL } from '@/lib/config';
import { getFeatureCoverageSummary } from '@/src/catalog/feature-catalog';
import { APP_VERSION, LEGACY_APP_URL, RELEASE_AUDIT_DATE } from '@/src/config/release';

type AuditBucket = {
  title: string;
  items: string[];
};

const coverage = getFeatureCoverageSummary();

const buckets: AuditBucket[] = [
  {
    title: 'Implemented',
    items: [
      'Super AgentOS Studio-first shell, apps, skills, workflows, Vault grants, governed memory/files, MCP routing, and subagent CRUD remain intact.',
      'Versioned public surfaces now align on AgentOS V6.6.2 and the canonical production host.',
      'Universal search covers apps, skills, workflows, sessions, projects, subagents, Vault names, docs, connectors, and FFP route records.',
      'Unified execution, recovery, panic stop, notifications, file actions, and memory export are implemented through production APIs.',
    ],
  },
  {
    title: 'Operational notes',
    items: [
      'Marketplace maturity remains a product-hardening area even though app and skill install flows are live.',
      'FFP remains visible but disabled by default unless explicitly enabled.',
    ],
  },
  {
    title: 'Hardening',
    items: [
      'Studio is now agent-aware: subagents can be created, discovered, switched, and operated inside Studio without navigation reset.',
      'Memory is editable and exportable in-product over the governed memory API, including create, update, delete, and grant-aware audit visibility.',
      'Release QA captures screenshots plus machine-readable logs, accessibility data, performance data, and summary artifacts.',
    ],
  },
];

const verifiedRoutes = [
  '/',
  '/studio',
  '/appstore',
  '/skills',
  '/workflows',
  '/files',
  '/agents',
  '/memory',
  '/vault',
  '/mcp',
  '/search',
  '/docs/audit',
  '/health',
  '/api',
];

export default function AuditPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <nav className="sticky top-0 z-40 backdrop-blur-md" style={{ background: 'rgba(10,10,20,0.85)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/docs" className="font-mono font-bold text-sm">Agent OS Docs</Link>
          <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--text-muted)' }}>
            <Link href="/docs/launch" className="hover:text-white">Launch Notes</Link>
            <Link href="/studio" className="hover:text-white">Studio</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-12 space-y-8">
        <section>
          <div className="badge badge-accent mb-4">Production Audit</div>
          <h1 className="text-4xl font-black mb-3">AgentOS v{APP_VERSION} audit - {RELEASE_AUDIT_DATE}</h1>
          <p className="text-lg" style={{ color: 'var(--text-muted)' }}>
            This report reflects the V6.6.2 release pass for <code>{APP_URL}</code>. The legacy deployment host <code>{LEGACY_APP_URL}</code> remains compatibility-only.
          </p>
        </section>

        <section className="grid md:grid-cols-3 gap-4">
          <div className="card p-5">
            <div className="text-3xl font-black mb-1" style={{ color: 'var(--accent)' }}>{coverage.platformFeatures}</div>
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Platform features audited</div>
          </div>
          <div className="card p-5">
            <div className="text-3xl font-black mb-1" style={{ color: 'var(--accent)' }}>{coverage.runtimeFunctions}</div>
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Runtime functions audited</div>
          </div>
          <div className="card p-5">
            <div className="text-3xl font-black mb-1" style={{ color: 'var(--accent)' }}>{coverage.totalCatalogItems}</div>
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Catalog items under review</div>
          </div>
        </section>

        <section className="grid gap-4">
          {buckets.map(bucket => (
            <article key={bucket.title} className="card p-6">
              <h2 className="text-xl font-bold mb-3">{bucket.title}</h2>
              <ul className="space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                {bucket.items.map(item => <li key={item}>{item}</li>)}
              </ul>
            </article>
          ))}
        </section>

        <section className="card p-6">
          <h2 className="text-xl font-bold mb-3">Verification target</h2>
          <ul className="space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            {verifiedRoutes.map(route => (
              <li key={route}>
                <code>{APP_URL}{route}</code>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-6">
          <h2 className="text-xl font-bold mb-3">Readiness</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            V6.6.2 is a Studio-first Super AgentOS release: execution, recovery, files, memory, apps, skills, workflows, MCP routing, diagnostic failures, and the locked desktop/mobile UI are connected through production APIs.
          </p>
        </section>
      </div>

      <DocsFooter />
    </div>
  );
}
