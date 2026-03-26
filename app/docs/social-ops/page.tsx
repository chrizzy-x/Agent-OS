import Link from 'next/link';
import DocsFooter from '@/components/DocsFooter';
import { APP_URL } from '@/lib/config';

const platforms = [
  {
    name: 'X',
    status: 'Live now',
    auth: 'OAuth user',
    accountType: 'Profile accounts',
    summary: 'Fully wired into Agent OS with account connect, child-agent mapping, draft review, queue control, manual publish, cron sync, and approval-first safeguards.',
    tone: '#f97316',
  },
  {
    name: 'Facebook',
    status: 'Scaffolded',
    auth: 'Meta app OAuth',
    accountType: 'Managed pages',
    summary: 'Ready in the control plane and documentation, but the publishing and moderation connector is not active yet.',
    tone: '#3b82f6',
  },
  {
    name: 'Instagram',
    status: 'Scaffolded',
    auth: 'Meta app OAuth',
    accountType: 'Business accounts',
    summary: 'Planned for approval-based publishing and cross-account guardrails using the same shared Meta credential layer.',
    tone: '#ec4899',
  },
  {
    name: 'Telegram',
    status: 'Scaffolded',
    auth: 'Bot token',
    accountType: 'Bot identities',
    summary: 'Planned for channel posting, inbox triage, and operator review around a dedicated Telegram bot identity.',
    tone: '#22c55e',
  },
  {
    name: 'YouTube',
    status: 'Scaffolded',
    auth: 'Google OAuth',
    accountType: 'Channel accounts',
    summary: 'Planned for channel publishing support, comment review, and metrics sync through a shared Google credential flow.',
    tone: '#ef4444',
  },
  {
    name: 'WhatsApp',
    status: 'Scaffolded',
    auth: 'Meta business access',
    accountType: 'Business numbers',
    summary: 'Planned for business messaging queues and operator review on approved sender assets inside the shared Meta integration surface.',
    tone: '#10b981',
  },
] as const;

const operatorFlow = [
  {
    title: '1. Open Example Dashboard',
    body: 'Use the Social Ops dashboard to see every supported network in one place, including which connectors are live, which credentials are configured, and how many accounts are currently connected.',
  },
  {
    title: '2. Connect accounts intentionally',
    body: 'For X, every managed account is connected through the platform OAuth flow and receives its own child agent. Do not share one account token across multiple account identities.',
  },
  {
    title: '3. Review drafts before publishing',
    body: 'Agents can draft, classify, and queue content, but operators remain the decision point before publishing. Review guardrail output, approve good drafts, and block risky ones.',
  },
  {
    title: '4. Publish and monitor from one place',
    body: 'Operators can publish immediately, let scheduled queue items run, and inspect account sync state without leaving the control plane.',
  },
];

const guardrails = [
  'Keep one agent identity per managed account. Do not merge multiple brands into one agent or one authorization token.',
  'Require human approval for replies, DMs, and sensitive outbound messaging until the account behavior is proven safe.',
  'Block duplicate or near-duplicate posts across managed accounts so the platform does not drift into spam behavior.',
  'Use rate limits, publish windows, daily caps, and a kill switch for every account or sender asset.',
  'Store credentials server-side only. Never put platform tokens in child-agent memory, prompt text, or proc execution payloads.',
  'Treat scaffolded networks as not production-ready until their connector and policy layer are implemented end to end.',
];

const liveRoutes = [
  {
    method: 'GET',
    path: '/api/social/platforms',
    desc: 'Returns the multi-network catalog used by the Social Ops dashboard, including connector readiness and the live X connection count.',
  },
  {
    method: 'POST',
    path: '/api/x/connect',
    desc: 'Starts the X OAuth flow for the authenticated operator and redirects back into the dashboard after authorization.',
  },
  {
    method: 'GET',
    path: '/api/x/accounts',
    desc: 'Lists X account connections visible to the current agent, including the child agent assigned to each account.',
  },
  {
    method: 'GET',
    path: '/api/x/drafts',
    desc: 'Lists draft posts and replies awaiting review, including guardrail reasons, similarity score, and approval state.',
  },
  {
    method: 'GET',
    path: '/api/x/queue',
    desc: 'Lists queued, published, failed, or canceled publish items for connected X accounts.',
  },
  {
    method: 'POST',
    path: '/api/x/drafts/:id/approve',
    desc: 'Marks a draft as approved so it can be published or remain eligible for scheduled publishing.',
  },
  {
    method: 'POST',
    path: '/api/x/drafts/:id/block',
    desc: 'Blocks a draft, records the reason, and cancels active queued publish items tied to that draft.',
  },
  {
    method: 'POST',
    path: '/api/x/publish',
    desc: 'Publishes an approved draft immediately or forces a queued item to publish now.',
  },
];

const envGroups = [
  {
    title: 'Shared secret management',
    vars: ['SOCIAL_TOKEN_ENCRYPTION_KEY', 'X_TOKEN_ENCRYPTION_KEY (legacy fallback)'],
  },
  {
    title: 'X',
    vars: ['X_CLIENT_ID', 'X_CLIENT_SECRET', 'X_REDIRECT_URI', 'X_OAUTH_SCOPES'],
  },
  {
    title: 'Meta (Facebook, Instagram, WhatsApp)',
    vars: ['META_APP_ID', 'META_APP_SECRET', 'META_REDIRECT_URI'],
  },
  {
    title: 'Telegram',
    vars: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_USERNAME'],
  },
  {
    title: 'Google / YouTube',
    vars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
  },
];

const rolloutOrder = [
  'Keep X as the proving ground until your approval workflow, logging, and kill-switch process are routine.',
  'Build Meta next if you want Facebook, Instagram, and WhatsApp under one credential and policy family.',
  'Build Telegram separately when you are ready for bot-centric workflows instead of social publishing flows.',
  'Add YouTube after that if channel publishing support and comment moderation matter more than short-form posting speed.',
];

export default function SocialOpsDocsPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <nav className="sticky top-0 z-40 backdrop-blur-md" style={{ background: 'rgba(10,10,20,0.88)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center font-black font-mono text-xs"
              style={{ background: 'linear-gradient(135deg, #3b82f6, #10b981)', boxShadow: '0 0 12px rgba(59,130,246,0.35)' }}>
              S
            </div>
            <span className="font-mono font-bold text-sm">Social<span className="gradient-text">Ops</span></span>
          </Link>
          <div className="flex items-center gap-5 text-sm">
            <Link href="/docs" className="transition-colors hover:text-white" style={{ color: 'var(--text-muted)' }}>Docs</Link>
            <Link href="/docs/api" className="transition-colors hover:text-white" style={{ color: 'var(--text-muted)' }}>API</Link>
            <Link href="/dashboard/social" className="transition-colors hover:text-white" style={{ color: 'var(--text-muted)' }}>Dashboard</Link>
            <Link href="/dashboard/x" className="btn-primary text-xs px-4 py-2">Open X Ops</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-12 space-y-12">
        <section className="grid lg:grid-cols-[1.1fr_0.9fr] gap-6 items-start">
          <div>
            <div className="badge badge-purple mb-4">Optional Example Module</div>
            <h1 className="text-4xl font-black mb-4">Social Ops example integration documentation</h1>
            <p className="text-lg max-w-3xl" style={{ color: 'var(--text-muted)' }}>
              Social Ops is an optional example module built on top of Agent OS primitives, auth, MCP routing, and operator workflows. It is not part of the core infrastructure story, but it remains useful as a reference for teams building domain-specific agent products on top of Agent OS.
            </p>
            <div className="flex flex-wrap gap-3 mt-6">
              <Link href="/dashboard/social" className="btn-primary px-5 py-2.5 text-sm">Open Social Ops</Link>
              <Link href="/docs/api" className="btn-outline px-5 py-2.5 text-sm">Read API Reference</Link>
            </div>
          </div>

          <div className="card p-6">
            <div className="text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>Current implementation status</div>
            <div className="space-y-3 text-sm" style={{ color: 'var(--text-muted)' }}>
              <p><strong style={{ color: 'var(--text)' }}>Live today:</strong> X account connection, draft review, queue control, manual publish, and background sync.</p>
              <p><strong style={{ color: 'var(--text)' }}>Why it stays here:</strong> this module demonstrates how a vertical product can be built on Agent OS without changing the core platform direction.</p>
              <p><strong style={{ color: 'var(--text)' }}>Canonical app URL:</strong> <code>{APP_URL}</code></p>
            </div>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
            <div>
              <h2 className="text-3xl font-black mb-2">Platform matrix</h2>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Every network supported by this example integration, including how it authenticates and what kind of account it manages.
              </p>
            </div>
            <Link href="/api/social/platforms" className="btn-outline text-xs px-4 py-2">Open live catalog</Link>
          </div>

          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {platforms.map(platform => (
              <article key={platform.name} className="card p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="text-xl font-bold">{platform.name}</h3>
                    <div className="text-xs mt-1" style={{ color: platform.tone }}>{platform.status}</div>
                  </div>
                  <div className="w-10 h-10 rounded-2xl" style={{ background: `${platform.tone}14`, border: `1px solid ${platform.tone}30` }} />
                </div>
                <div className="space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                  <p><strong style={{ color: 'var(--text)' }}>Auth:</strong> {platform.auth}</p>
                  <p><strong style={{ color: 'var(--text)' }}>Account type:</strong> {platform.accountType}</p>
                  <p>{platform.summary}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="grid lg:grid-cols-[0.95fr_1.05fr] gap-6">
          <div className="card p-6">
            <h2 className="text-2xl font-black mb-4">Operator workflow</h2>
            <div className="space-y-4">
              {operatorFlow.map(step => (
                <article key={step.title} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                  <h3 className="font-bold mb-2">{step.title}</h3>
                  <p className="text-sm leading-6" style={{ color: 'var(--text-muted)' }}>{step.body}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="card p-6">
            <h2 className="text-2xl font-black mb-4">Guardrails users should expect</h2>
            <ul className="space-y-3 text-sm" style={{ color: 'var(--text-muted)' }}>
              {guardrails.map(item => (
                <li key={item} className="flex items-start gap-3">
                  <span style={{ color: '#f97316' }}>-</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="grid lg:grid-cols-[0.92fr_1.08fr] gap-6">
          <div className="card p-6">
            <h2 className="text-2xl font-black mb-4">Required configuration</h2>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
              Social Ops reads environment variables from the main application runtime. Configure the relevant credential family before you expect a scaffolded connector to report as ready.
            </p>
            <div className="space-y-4">
              {envGroups.map(group => (
                <div key={group.title}>
                  <div className="text-sm font-semibold mb-2">{group.title}</div>
                  <div className="flex flex-wrap gap-2">
                    {group.vars.map(variable => (
                      <code key={variable} className="text-xs font-mono px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: '#93c5fd' }}>
                        {variable}
                      </code>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-6">
            <h2 className="text-2xl font-black mb-4">Live routes users can rely on today</h2>
            <div className="space-y-3">
              {liveRoutes.map(route => (
                <div key={route.path} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: 'rgba(34,197,94,0.12)', color: '#86efac', border: '1px solid rgba(34,197,94,0.22)' }}>
                      {route.method}
                    </span>
                    <code className="text-sm font-mono">{route.path}</code>
                  </div>
                  <p className="text-sm leading-6" style={{ color: 'var(--text-muted)' }}>{route.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="text-2xl font-black mb-4">Recommended rollout order</h2>
          <div className="grid lg:grid-cols-2 gap-4">
            {rolloutOrder.map((item, index) => (
              <div key={item} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                <div className="text-xs font-mono mb-2" style={{ color: '#a78bfa' }}>STEP 0{index + 1}</div>
                <p className="text-sm leading-6" style={{ color: 'var(--text-muted)' }}>{item}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <DocsFooter />
    </div>
  );
}
