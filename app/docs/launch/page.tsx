import Link from 'next/link';
import DocsFooter from '@/components/DocsFooter';
import { APP_URL } from '@/lib/config';
import { PROJECT_DETAILS, getFeatureCoverageSummary } from '@/src/catalog/feature-catalog';
import { OFFICIAL_SKILL_PACKS, getOfficialSkillCount } from '@/src/skills/official-catalog';

const coverage = getFeatureCoverageSummary();
const officialSkillCount = getOfficialSkillCount();

const releaseHighlights = [
  'Studio is live as a terminal-style agent console without exposing a raw host shell.',
  'The universal MCP layer, marketplace skills, public docs, and ops crew now ship together in one product surface.',
  'Browser session auth is now the default web experience; bearer tokens are generated on demand for external tools and SDKs.',
  'Password reset, ops-admin mutation guards, sandbox environment stripping, and database email-uniqueness hardening are in production.',
];

const changelog = [
  'Added the Studio page and the /api/studio/command backend with preview-and-confirm execution for mutating commands.',
  'Moved the browser UX onto secure session cookies so users do not have to paste bearer tokens into the web app.',
  'Expanded the official verified free skill catalog into multiple maintained packs across AI, support, research, finance, communication, deployment, security, and analytics.',
  'Restricted ops mutations to ops-admin callers and reduced public ops routes to aggregate visibility only.',
  'Standardized MCP routing so primitives, installed skills, and external MCP tools all execute through one registry.',
];

const startLinks = [
  { label: 'Create an agent', href: '/signup' },
  { label: 'Sign in', href: '/signin' },
  { label: 'Open Studio', href: '/studio' },
  { label: 'Browse skills', href: '/marketplace' },
  { label: 'Skills docs', href: '/docs/skills' },
  { label: 'API reference', href: '/docs/api' },
  { label: 'Health check', href: '/health' },
  { label: 'Ops summary', href: '/api/ops/metrics' },
];

export default function LaunchNotesPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <nav className="sticky top-0 z-40 backdrop-blur-md" style={{ background: 'rgba(10,10,20,0.85)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/docs" className="font-mono font-bold text-sm">Agent OS Docs</Link>
          <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--text-muted)' }}>
            <Link href="/docs/audit" className="hover:text-white">Audit</Link>
            <Link href="/docs/skills" className="hover:text-white">Skills</Link>
            <Link href="/studio" className="hover:text-white">Studio</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-12 space-y-8">
        <section>
          <div className="badge badge-purple mb-4">Launch Notes</div>
          <h1 className="text-4xl font-black mb-3">Agent OS v2 is live for developers</h1>
          <p className="text-lg" style={{ color: 'var(--text-muted)' }}>
            Agent OS v2 is live at <code>{APP_URL}</code>. It gives developers one production platform for hosted primitives, universal MCP routing, verified skills, a guarded Studio console, and an autonomous ops crew instead of a stack of disconnected tools.
          </p>
        </section>

        <section className="card p-6">
          <h2 className="text-2xl font-bold mb-4">Short launch post</h2>
          <div className="space-y-4 text-sm" style={{ color: 'var(--text-muted)' }}>
            <p>
              Agent OS is a production platform for building and operating autonomous agents with real infrastructure behind them. You can sign up, keep a secure browser session, open Studio, execute primitives or MCP tools, install verified skills, and inspect platform coverage without wiring your own storage, cache, queue, or control plane first.
            </p>
            <p>
              What matters in the live system today is concrete coverage: {coverage.platformFeatures} platform features, {coverage.runtimeFunctions} runtime functions, {coverage.totalCatalogItems} catalog items under ops coverage, and {officialSkillCount} official verified free skills grouped into {OFFICIAL_SKILL_PACKS.length} maintained packs. Production remains canonical on <code>{APP_URL}</code> while <code>https://agentos.service</code> finishes DNS activation.
            </p>
          </div>
        </section>

        <section className="grid md:grid-cols-2 gap-4">
          <div className="card p-6">
            <h2 className="text-xl font-bold mb-4">Why it matters</h2>
            <ul className="space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              {PROJECT_DETAILS.differentiators.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="card p-6">
            <h2 className="text-xl font-bold mb-4">What you can do today</h2>
            <ul className="space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              <li>Provision an agent account and stay signed in with a secure browser session.</li>
              <li>Generate a fresh bearer token only when you need CLI, SDK, or external API access.</li>
              <li>Use Studio to run guided commands and preview mutating operations before they execute.</li>
              <li>Install from official verified skill packs or publish your own extensions to the marketplace.</li>
            </ul>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="text-2xl font-bold mb-4">Technical release notes / changelog</h2>
          <div className="space-y-4 text-sm" style={{ color: 'var(--text-muted)' }}>
            <p>Stack: {PROJECT_DETAILS.stack.join('; ')}.</p>
            <ul className="space-y-2">
              {releaseHighlights.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <div className="font-semibold mb-2" style={{ color: 'var(--text)' }}>Detailed changes in this release</div>
              <ul className="space-y-2">
                {changelog.map(item => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <div className="font-semibold mb-2" style={{ color: 'var(--text)' }}>Known limitation</div>
              <p>
                The canonical production hostname remains <code>{APP_URL}</code> until the apex DNS record for <code>agentos.service</code> is added as <code>A @ -&gt; 76.76.21.21</code> and Vercel finishes HTTPS issuance.
              </p>
            </div>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="text-2xl font-bold mb-4">How to start</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {startLinks.map(link => (
              <Link key={link.href} href={link.href} className="rounded-xl px-4 py-3 text-sm font-medium transition-colors hover:text-white" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                {link.label}
              </Link>
            ))}
          </div>
        </section>
      </div>

      <DocsFooter />
    </div>
  );
}
