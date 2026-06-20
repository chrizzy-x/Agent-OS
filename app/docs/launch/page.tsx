import Link from 'next/link';
import DocsFooter from '@/components/DocsFooter';
import { APP_URL } from '@/lib/config';
import { PROJECT_DETAILS, getFeatureCoverageSummary } from '@/src/catalog/feature-catalog';
import { OFFICIAL_SKILL_PACKS, getOfficialSkillCount } from '@/src/skills/official-catalog';

const coverage = getFeatureCoverageSummary();
const officialSkillCount = getOfficialSkillCount();

const releaseHighlights = [
  'v6.6.4 - Rebuilt non-Studio authenticated surfaces around the Workspace -> Projects -> Assets -> Workflows -> App Store -> Library hierarchy without changing Studio chat, streaming, or Super AgentOS execution.',
  'June 18, 2026 - NL Studio now uses a rebuilt conversation-first layout with real SSE streaming, Markdown replies, safe stop/cancel, lazy chat creation, searchable history, and desktop/mobile parity.',
  'V6.6.2 - Super AgentOS is now the primary product surface with streaming chat, execution cards, files, memory, recovery, notifications, and panic stop.',
  'V6.6.2 - Unified execution records now persist Super AgentOS requests, app lifecycle actions, skill calls, workflow runs, file actions, memory actions, logs, failures, and recovery state.',
  'V6.6.2 - Files now support upload, preview, summarize, rename, search, and delete through production APIs and UI.',
  'V6.6.2 - Memory now supports governed CRUD, search, export, namespace scopes, and permission-aware retrieval.',
  'v6.5 - Studio now supports in-place multi-agent discovery, creation, switching, and agent-linked sessions without page resets.',
  'v6.5 - Search now exposes keyword, full-text, and fuzzy matching across apps, skills, workflows, sessions, projects, subagents, Vault names, docs, connectors, and FFP records.',
  'v6.5 - Memory is now editable in-product with governed create, update, delete, and grant-aware audit visibility.',
  'V6.6.2 - Release truth alignment standardizes the canonical production host on https://www.agentos.services and aligns public version surfaces on 6.6.2.',
  'V6.6.2 - Studio-first UI lock makes / and /studio open Super AgentOS before every store, dashboard, or admin-style surface.',
  'v6.2 - beta readiness hardening for Vault runtime injection, output redaction, disabled-app gating, developer access shells, and production lifecycle flows.',
  'v6 "Public Launch" - agent IDs are treated as private secrets across UI, docs, API responses, marketplace/appstore payloads, workflows, Studio, Workspaces, and activity output.',
  'Public deployed-agent actions now use opaque agentRef values from /api/agents; raw private IDs are rejected in browser-facing creation flows.',
  'Browser sessions now expose account name and expiry only. API callers continue to use bearer tokens; IDs stay inside signed tokens and server-side storage.',
  'Marketplace split is ready: Skill Store for installable capabilities, App Store for downloadable agentic apps built on AgentOS.',
  'V6.6.2 - FFP is temporary only: the workspace toggle creates a future wiring point, not a live consensus engine.',
  'GET/PATCH /api/ffp/temp: workspace-level temporary routing setting for multi-agent workflows, subagent collaboration, and multi-agent delegation.',
  'Single-agent execution bypasses FFP temp; no consensus proof, validator voting, proposal history, or fake consensus result ships in V6.6.2.',
  'v4 "Hermes" - Natural Language Studio, Workflow Library, SDK Kernel, and Redis events command layer.',
  'Crypto-only payments: Solana and Base network USDC, verified on-chain without a payment processor.',
];

const changelog = [
  'Rebuilt NL Studio chat, composer, session sidebar, mode header, and streaming lifecycle; verified send, response, new chat, history reopen, mode switching, and mobile layout with Playwright.',
  'Added agent_executions, agent_execution_logs, and agent_notifications persistence for recoverable task state.',
  'Added /api/executions, /api/recovery, /api/panic, and /api/notifications route surfaces.',
  'Added file preview, summarize, rename, upload, delete, and search flows to /files and Super AgentOS context.',
  'Added memory export and execution tracking around memory writes and deletes.',
  'Added Panic Button, Recovery Center, notification drawer, compact execution sidebar, and execution actions.',
  'Removed production generic skill fallback; installed skills must execute real skill source code in production.',
  'Repositioned homepage, docs, marketplace, and launch surfaces around AgentOS as the operating system for the agent economy.',
  'Added workspace-first Super AgentOS visibility for sessions, instructions, installed assets, workflows, and recent actions.',
  'Added Studio session rename, archive, project scoping, per-session instructions, and structured intent result states.',
  'Added browser-session refresh handling and deterministic loading, signed-out, expired-session, empty, success, and error states across protected routes.',
  'Removed fake App Store ratings, placeholder marketplace cards, seeded user-facing skill records, and fabricated fallback analytics from launch-facing surfaces.',
  'Recovered valid legacy SDK registry rows into factual external SDK App Store listings, including pre-metadata and pre-019 rows.',
  'Replaced FFP consensus claims with FFP temp navigation, workspace status, affected execution types, and clear future-wiring language.',
  'Added app readiness resolution, target-aware open flows, install and update revalidation, and owner analytics on app profiles.',
  'Added persisted Vault runtime grants, consume and cleanup flows, assignment and permission checks, and secret redaction in Studio persistence.',
  'Kept Studio chat sessions focused on create, continue, rename, archive, delete, search, export, and refresh persistence.',
  'Locked NL Studio, Workflow Studio, and Code Studio as distinct center workspaces with compact side navigation, context rows, and mobile ChatGPT-style navigation.',
  'Enabled free-beta self-serve plan transitions in /billing and POST /api/plans/transition across Free, Pro, Enterprise, and Enterprise Max.',
  'Removed public agent ID display/copy surfaces from signup, nav, dashboard, Studio, Connect, Workspaces, X/Social, Skill Store, App Store, FFP routes, and docs.',
  'Added display-redaction helpers for agentId, agent_id, child/subagent IDs, owner/publisher/author references, actor/user IDs, and agent_* string patterns.',
  'Changed /api/session to return only authenticated session display fields; no private agent ID leaves the browser session endpoint.',
  'Changed deployed-agent APIs to return agentRef, agent name, status, and metrics; command/activity/subagent routes resolve refs server-side.',
  'Updated Workspaces to add agents by name only and return public workspace/member/audit payloads.',
  'Renamed public FFP dynamic routes from [agentId] to [privateRef] and updated docs to private-reference language.',
  'Created GET/PATCH /api/ffp/temp for workspace-level FFP temp status and routing.',
  'Created POST /api/studio/intent - NL intent parser, plan storage, confirm tokens, scheduled workflow support, and natural-language answers.',
  'Created GET+POST /api/agent/workflows and PATCH+DELETE /api/agent/workflows/:id - full workflow CRUD.',
  'Created POST /api/kernel/register, GET /api/kernel/registry, POST /api/kernel/command, GET /api/kernel/status/:product.',
  'Updated Studio UI with NL mode toggle, workflow library panel, kernel status panel, and redacted results.',
  'Added FFP temp navigation below Universal MCP with a workspace toggle and no consensus results.',
  'Rewrote payments to crypto-only: Solana RPC getTransaction + Base eth_getTransactionReceipt verification.',
];

const startLinks = [
  { label: 'Create AgentOS account', href: '/signup' },
  { label: 'Sign in', href: '/signin' },
  { label: 'Open Super AgentOS', href: '/studio' },
  { label: 'Browse skills', href: '/library?section=skills' },
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
          <h1 className="text-4xl font-black mb-3">AgentOS v6.6.4 <span style={{ color: 'var(--accent)' }}>&ldquo;Workspace Architecture &amp; Asset System&rdquo;</span></h1>
          <p className="text-lg" style={{ color: 'var(--text-muted)' }}>
            v6.6.4 makes AgentOS a workspace operating system for projects, assets, workflows, App Store discovery, and Library ownership while preserving Studio streaming and execution. Live at <code>{APP_URL}</code>.
          </p>
        </section>

        <section className="card p-6">
          <h2 className="text-2xl font-bold mb-4">What shipped in v6.6.4</h2>
          <div className="space-y-4 text-sm" style={{ color: 'var(--text-muted)' }}>
            <p>
              AgentOS now keeps every first-class module one click away inside a shell that persists across navigation. Studio modes switch in place without resetting sessions, files, workflows, terminal state, or drafts.
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
              <li>Provision a workspace with Super AgentOS and stay signed in with a secure browser session.</li>
              <li>Use Studio as a chat-first operating surface for sessions, projects, workflows, skills, apps, memory, and run logs.</li>
              <li>Open the marketplace discovery layer, inspect Skill Store capabilities, and install App Store packages with real readiness checks.</li>
              <li>Register external apps and agents through the SDK so they become discoverable in the same product layer as native assets.</li>
              <li>Generate a fresh bearer token only when you need CLI, SDK, or external API access.</li>
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
