import Link from 'next/link';
import DocsFooter from '@/components/DocsFooter';
import { APP_URL } from '@/lib/config';
import { PROJECT_DETAILS, getFeatureCoverageSummary } from '@/src/catalog/feature-catalog';
import { OFFICIAL_SKILL_PACKS, getOfficialSkillCount } from '@/src/skills/official-catalog';

const coverage = getFeatureCoverageSummary();
const officialSkillCount = getOfficialSkillCount();

const releaseHighlights = [
  'v6.2 - beta readiness hardening for Vault runtime injection, output redaction, disabled-app gating, developer access shells, and production lifecycle flows.',
  'v6 "Public Launch" - agent IDs are treated as private secrets across UI, docs, API responses, marketplace/appstore payloads, workflows, Studio, Workspaces, and activity output.',
  'Public deployed-agent actions now use opaque agentRef values from /api/agents; raw private IDs are rejected in browser-facing creation flows.',
  'Browser sessions now expose account name and expiry only. API callers continue to use bearer tokens; IDs stay inside signed tokens and server-side storage.',
  'Marketplace split is ready: Skill Store for installable capabilities, App Store for downloadable agentic apps built on AgentOS.',
  'v5 "Ares" - FFP Multi-Chain Router: FFP sector chains reach consensus on decisions, AgentOS executes them via a cryptographically verified bridge.',
  'POST /api/ffp/execute: consensus proof verification, chain-scoped execution, and immutable logging in ffp_chain_executions.',
  'GET /api/ffp/chains and GET /ffp/status: public FFP runtime and chain discovery endpoints.',
  'v4 "Hermes" - Natural Language Studio, Workflow Library, SDK Kernel, and Redis events command layer.',
  'Crypto-only payments: Solana and Base network USDC, verified on-chain without a payment processor.',
];

const changelog = [
  'Removed fake App Store ratings, placeholder marketplace cards, seeded user-facing skill records, and fabricated fallback analytics from launch-facing surfaces.',
  'Recovered valid legacy SDK registry rows into factual external SDK App Store listings, including pre-metadata and pre-019 rows.',
  'Restored FFP as a first-class module with visible navigation, runtime status, related workflows, related apps, activity, and logs.',
  'Added app readiness resolution, target-aware open flows, install and update revalidation, and owner analytics on app profiles.',
  'Added persisted Vault runtime grants, consume and cleanup flows, assignment and permission checks, and secret redaction in Studio persistence.',
  'Added Studio session branching, lineage tracking, chosen and latest snapshot inheritance, and isolated branch messages and events.',
  'Replaced self-serve billing transitions in the public UI with request-access and contact-sales flows until real billing is shipped.',
  'Removed public agent ID display/copy surfaces from signup, nav, dashboard, Studio, Connect, Workspaces, X/Social, Skill Store, App Store, FFP routes, and docs.',
  'Added display-redaction helpers for agentId, agent_id, child/subagent IDs, owner/publisher/author references, actor/user IDs, and agent_* string patterns.',
  'Changed /api/session to return only authenticated session display fields; no private agent ID leaves the browser session endpoint.',
  'Changed deployed-agent APIs to return agentRef, agent name, status, and metrics; command/activity/subagent routes resolve refs server-side.',
  'Updated Workspaces to add agents by name only and return public workspace/member/audit payloads.',
  'Renamed public FFP dynamic routes from [agentId] to [privateRef] and updated docs to private-reference language.',
  'Created POST /api/ffp/execute - FFP bridge endpoint: requireAgentContext -> verifyConsensusProof -> buildChainScopedContext -> executeUniversalToolCall -> log to ffp_chain_executions.',
  'Created GET /api/ffp/chains - public chain discovery: aggregates execution count, success/fail stats, and last execution per chain_id.',
  'Created POST /api/studio/intent - NL intent parser, plan storage, confirm tokens, scheduled workflow support, and natural-language answers.',
  'Created GET+POST /api/agent/workflows and PATCH+DELETE /api/agent/workflows/:id - full workflow CRUD.',
  'Created POST /api/kernel/register, GET /api/kernel/registry, POST /api/kernel/command, GET /api/kernel/status/:product.',
  'Updated Studio UI with NL mode toggle, workflow library panel, kernel status panel, and redacted results.',
  'Added FFP tab to dashboard with audit trail, consensus history, and refresh.',
  'Rewrote payments to crypto-only: Solana RPC getTransaction + Base eth_getTransactionReceipt verification.',
];

const startLinks = [
  { label: 'Create AgentOS account', href: '/signup' },
  { label: 'Sign in', href: '/signin' },
  { label: 'Open Studio', href: '/studio' },
  { label: 'Browse skills', href: '/marketplace' },
  { label: 'Browse apps', href: '/appstore' },
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
          <div className="badge badge-accent mb-4">Launch Notes</div>
          <h1 className="text-4xl font-black mb-3">Agent OS v6.2 <span style={{ color: 'var(--accent)' }}>&ldquo;Beta Readiness&rdquo;</span> is live</h1>
          <p className="text-lg" style={{ color: 'var(--text-muted)' }}>
            v6.2 ships hardened Vault runtime injection, shared output redaction, disabled-app lifecycle enforcement, safer developer gating, restored FFP visibility, and legacy SDK recovery. Agent IDs stay private, deployed-agent actions use public refs, and docs and API payloads stay launch-aligned. Live at <code>{APP_URL}</code>.
          </p>
        </section>

        <section className="card p-6">
          <h2 className="text-2xl font-bold mb-4">What shipped in v6.2</h2>
          <div className="space-y-4 text-sm" style={{ color: 'var(--text-muted)' }}>
            <p>
              AgentOS is a production infrastructure layer for autonomous agents. One bearer token gives you 6 primitives (mem, fs, db, net, events, proc), a Skill Store for capabilities, an App Store for downloadable agentic apps, universal MCP routing to external services, FFP audit + consensus, and a Natural Language Studio. In v6.2, private agent IDs stay server-side, users operate with agent names and public action refs, readiness-checked apps stay enforced, and Vault-backed runtime access is granted ephemerally with redacted execution output.
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
              <li>Install from official verified skill packs, publish your own extensions, or download full agentic apps from the App Store.</li>
              <li>Register any external agent once, receive a scoped token, and use the same MCP endpoint for primitives, skills, and external connectors.</li>
            </ul>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="text-2xl font-bold mb-4">v6 Public Launch changelog</h2>
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
