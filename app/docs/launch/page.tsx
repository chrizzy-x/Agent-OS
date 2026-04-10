import Link from 'next/link';
import DocsFooter from '@/components/DocsFooter';
import { APP_URL } from '@/lib/config';
import { PROJECT_DETAILS, getFeatureCoverageSummary } from '@/src/catalog/feature-catalog';
import { OFFICIAL_SKILL_PACKS, getOfficialSkillCount } from '@/src/skills/official-catalog';

const coverage = getFeatureCoverageSummary();
const officialSkillCount = getOfficialSkillCount();

const releaseHighlights = [
  'v5 "Ares" — FFP Multi-Chain Router: FFP sector chains (Finance, Health, Metaverse, etc.) reach consensus on decisions, AgentOS executes them via a cryptographically verified bridge.',
  'POST /api/ffp/execute: consensus proof verification (HMAC-SHA256, threshold, 5-min expiry, input hash) → chain-scoped execution → immutable log in ffp_chain_executions.',
  'GET /api/ffp/chains: public discovery endpoint — lists all active FFP sector chains with execution stats.',
  'Chain-scoped isolation: agentId = "ffp:{chainId}:{agentId}" auto-namespaces all 6 primitives per chain without touching primitive code.',
  'v4 "Hermes" — Natural Language Studio: describe a workflow in plain English, Claude plans it, you confirm, it executes and saves.',
  'Workflow Library: every executed plan is saved with name, schedule, and status. Pause, resume, or delete from the dashboard.',
  'SDK Kernel Command Layer: SDK products register command + status topics and receive dispatched commands via the Redis events bus.',
  'FFP tab in dashboard: agents can now view their own audit trail and consensus history without admin access.',
  'SDK dashboard login: POST /api/session/from-key with your API key → get a one-time login link → full dashboard including FFP.',
  'Full mobile responsiveness: viewport meta, overflow fixes, responsive nav across all pages.',
  'Crypto-only payments: Solana and Base network USDC, verified on-chain without a payment processor.',
];

const changelog = [
  'Created POST /api/ffp/execute — FFP bridge endpoint: requireAgentContext → verifyConsensusProof → buildChainScopedContext → executeUniversalToolCall → log to ffp_chain_executions.',
  'Created GET /api/ffp/chains — public chain discovery: aggregates execution count, success/fail stats, and last execution per chain_id.',
  'Created src/ffp/chain-verifier.ts — HMAC-SHA256 consensus proof verification with constant-time comparison, input hash check, 5-min expiry, threshold enforcement.',
  'Created src/ffp/chain-context.ts — buildChainScopedContext sets agentId = "ffp:{chainId}:{agentId}", auto-namespacing all 6 primitives.',
  'Created ffp_chain_executions table in Supabase — indexed on chain_id, agent_id, executed_at.',
  'Created POST /api/studio/intent — NL intent parser backed by claude-sonnet-4-6, plan stored in Redis with 5-min TTL confirm token.',
  'Created GET+POST /api/agent/workflows and PATCH+DELETE /api/agent/workflows/:id — full workflow CRUD.',
  'Created POST /api/kernel/register, GET /api/kernel/registry, POST /api/kernel/command, GET /api/kernel/status/:product.',
  'Created GET /api/agent/ffp/audit and GET /api/agent/ffp/consensus — agent-scoped FFP routes (no admin required).',
  'Created POST /api/session/from-key and GET /api/session/from-key/callback — SDK to browser session bridge.',
  'Updated Studio UI with NL mode toggle, workflow library panel, and kernel status panel with 15s auto-refresh.',
  'Added FFP tab to dashboard with audit trail, consensus history, and refresh.',
  'Added viewport meta tag, overflow-x: hidden on html/body, responsive nav.',
  'Rewrote payments to crypto-only: Solana RPC getTransaction + Base eth_getTransactionReceipt verification.',
];

const startLinks = [
  { label: 'Create an agent', href: '/signup' },
  { label: 'Sign in', href: '/signin' },
  { label: 'Open Studio', href: '/studio' },
  { label: 'Browse skills', href: '/marketplace' },
  { label: 'Quick Start', href: '/docs/sdk' },
  { label: 'API reference', href: '/docs/api' },
  { label: 'FFP docs', href: '/docs/ffp' },
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
          <h1 className="text-4xl font-black mb-3">Agent OS v5 <span className="gradient-text">&ldquo;Ares&rdquo;</span> is live</h1>
          <p className="text-lg" style={{ color: 'var(--text-muted)' }}>
            v5 ships the FFP Multi-Chain Router — FFP sector chains reach consensus, AgentOS verifies and executes. Built on top of v4&apos;s NL Studio, Workflow Library, SDK Kernel, and the 6 core primitives. Live at <code>{APP_URL}</code>.
          </p>
        </section>

        <section className="card p-6">
          <h2 className="text-2xl font-bold mb-4">What shipped in v5</h2>
          <div className="space-y-4 text-sm" style={{ color: 'var(--text-muted)' }}>
            <p>
              AgentOS is a production infrastructure layer for autonomous agents. One API key gives you 6 primitives (mem, fs, db, net, events, proc), a skills marketplace, universal MCP routing to external services, FFP audit + consensus, a Natural Language Studio, and now a full FFP Multi-Chain Router so sector chains can execute tools through AgentOS as a verified bridge.
            </p>
            <p>
              Platform coverage: {coverage.platformFeatures} platform features, {coverage.runtimeFunctions} runtime functions, {coverage.totalCatalogItems} catalog items under ops coverage, {officialSkillCount} official verified free skills across {OFFICIAL_SKILL_PACKS.length} maintained packs. Production is live at <code>{APP_URL}</code>.
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
              <li>Register any external agent once, receive a scoped token, and use the same MCP endpoint for primitives, skills, and external connectors.</li>
            </ul>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="text-2xl font-bold mb-4">v5 Ares — changelog</h2>
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


