'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SurfaceShell from '@/components/os/surface-shell';
import { useApplicationShell } from '@/components/os/application-shell';
import {
  ActivityFeed,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  StatusPill,
} from '@/components/os/ui';
import {
  fetchBrowserSessionState,
  fetchWithBrowserSession,
  type BrowserSession,
  type BrowserSessionAuthState,
} from '@/src/auth/browser-session';

const DASHBOARD_TIMEOUT_MS = 8000;

type DashboardPayload = {
  workspace: { id: string; name: string; slug: string; plan: string } | null;
  plan: { plan: string; label: string; enterprise: boolean };
  summary: {
    sessions: number;
    projects: number;
    installedApps: number;
    installedSkills: number;
    workflows: number;
    privateSubagents: number;
    vaultSecrets: number;
    sdkApps: number;
    ffpChains: number;
    mcpConnectors: number;
    recentEvents: number;
  };
  recentSessions: Array<{ id: string; title: string; status: string; updatedAt: string }>;
  activeProjects: Array<{ id: string; name: string; plan: string; href: string; createdAt: string }>;
  installedApps: Array<{
    id: string;
    name: string;
    slug: string;
    description: string;
    healthStatus: string;
    openCount: number;
    favorite: boolean;
    href: string;
  }>;
  installedSkills: Array<{ id: string; installedAt: string; name: string; slug: string; category: string; description: string }>;
  workflows: Array<{ id: string; name: string; summary: string; status: string; updatedAt: string; lastRunAt: string | null }>;
  privateSubagents: Array<{
    id: string;
    name: string;
    description: string | null;
    visibility: string;
    status: string;
    projectId: string | null;
    updatedAt: string;
    href: string;
  }>;
  vault: { total: number; active: number; lastUsedAt: string | null };
  mcp: {
    connectorCount: number;
    activeConnectors: number;
    lastCallAt: string | null;
    connectors: Array<{ name: string; category: string; status: string }>;
  };
  credits: {
    available: boolean;
    status: string;
    label: string;
    balance: number | string | null;
    resetWindow: string | null;
    weeklyAllowance: number | string | null;
    message: string;
  };
  recommendedActions: Array<{ id: string; label: string; href: string; reason: string }>;
  recentEvents: Array<{ id: string; sessionId: string; type: string; summary: string; createdAt: string }>;
};

const QUICK_ACTIONS = [
  { label: 'Super AgentOS', href: '/studio?mode=nl' },
  { label: 'Workflow Builder', href: '/studio?mode=workflow' },
  { label: 'Code Studio', href: '/studio?mode=code' },
  { label: 'Projects', href: '/projects' },
  { label: 'Appstore', href: '/appstore' },
  { label: 'Skill Store', href: '/skillstore' },
  { label: 'Library', href: '/library' },
  { label: 'Vault', href: '/vault' },
  { label: 'Universal MCP', href: '/mcp' },
];

function hourGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'No activity yet';
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return 'Recent activity';
  }
}

function countState(count: number, singular: string, plural: string, empty: string): string {
  if (count === 0) return empty;
  if (count === 1) return `1 ${singular}`;
  return `${count} ${plural}`;
}

function dashboardUrl(workspaceId: string | null | undefined): string {
  if (!workspaceId) return '/api/dashboard';
  return `/api/dashboard?workspace=${encodeURIComponent(workspaceId)}`;
}

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out.`)), DASHBOARD_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function fetchDashboardResponse(url: string): Promise<{ response: Response; authState: BrowserSessionAuthState }> {
  const direct = await withTimeout(fetch(url, { cache: 'no-store', credentials: 'include' }), 'Dashboard request').catch(() => null);
  if (direct && direct.status !== 401) return { response: direct, authState: 'active' };
  return withTimeout(fetchWithBrowserSession(url, { cache: 'no-store' }), 'Authenticated dashboard request');
}

function Section(props: { title: string; actionHref?: string; actionLabel?: string; children: ReactNode }) {
  return (
    <section style={{ display: 'grid', gap: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18, letterSpacing: 0 }}>{props.title}</h2>
        {props.actionHref && props.actionLabel ? (
          <Link href={props.actionHref} className="os-chip" style={{ textDecoration: 'none' }}>
            {props.actionLabel}
          </Link>
        ) : null}
      </div>
      {props.children}
    </section>
  );
}

function LinkCard(props: { href: string; title: string; body: string; meta?: ReactNode }) {
  return (
    <Link href={props.href} className="os-card-link">
      <Card style={{ padding: 14, minHeight: 104 }}>
        <div className="os-entity-head" style={{ alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div className="os-entity-title">{props.title}</div>
            <div className="os-entity-copy">{props.body}</div>
          </div>
          {props.meta}
        </div>
      </Card>
    </Link>
  );
}

function SignedOutHome(props: { authState: BrowserSessionAuthState }) {
  const expired = props.authState === 'expired';
  const publicSurfaces = [
    { label: 'Studio', href: '/studio?mode=nl', body: 'Start with Super AgentOS, then route work into NL Studio, Workflow Builder, or Code Studio.' },
    { label: 'Appstore', href: '/appstore', body: 'Browse SDK-backed apps when listings are available.' },
    { label: 'Skill Store', href: '/skillstore', body: 'Browse modular capabilities for Super AgentOS and workflows.' },
    { label: 'Docs', href: '/resources', body: 'Read product, developer, Vault, MCP, workflow, and FFP documentation.' },
    { label: 'Community', href: '/community', body: 'Open the community and discovery surface.' },
    { label: 'FFP', href: '/ffp', body: 'View the disabled coming-soon protocol surface without fake validator activity.' },
  ];
  const lockedWorkspaceSurfaces = [
    'Recent sessions',
    'Active projects',
    'Installed apps',
    'Installed skills',
    'Workflows',
    'Incognito subagents',
    'Vault health',
    'MCP status',
    'Agent Credits',
  ];
  return (
    <SurfaceShell activePath="/">
      <section style={{ display: 'grid', gap: 20, padding: '28px 0 56px' }}>
        <div style={{ display: 'grid', gap: 10, maxWidth: 760 }}>
          <Badge tone="accent">AgentOS Home</Badge>
          <h1 style={{ margin: 0, fontSize: 'clamp(30px, 5vw, 48px)', lineHeight: 1.05, letterSpacing: 0 }}>
            Workspace command overview
          </h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 16, lineHeight: 1.7 }}>
            {expired
              ? 'Your session expired, but Home stays available. Sign in again when you want your real workspace activity, Vault permissions, MCP connections, and compute state.'
              : 'Home is public. Everyone can see the AgentOS command map here; personal workspace data appears only after sign-in.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button href="/studio?mode=nl">Open Super AgentOS</Button>
          <Button href="/signin" variant="secondary">{expired ? 'Sign in again' : 'Sign in'}</Button>
          <Button href="/signup" variant="secondary">Create account</Button>
        </div>
        <Section title="Open AgentOS Surfaces">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
            {publicSurfaces.map(item => (
              <LinkCard key={item.label} href={item.href} title={item.label} body={item.body} meta={<span style={{ color: 'var(--text-tertiary)' }}>Open</span>} />
            ))}
          </div>
        </Section>

        <Section title="Workspace Data">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            {lockedWorkspaceSurfaces.map(item => (
              <Card key={item} style={{ padding: 14 }}>
                <div className="os-entity-title">{item}</div>
                <div className="os-entity-copy">Personal data hidden until sign-in.</div>
              </Card>
            ))}
          </div>
        </Section>

        <Card style={{ padding: 16 }}>
          <div className="os-entity-head" style={{ alignItems: 'flex-start', gap: 12 }}>
            <div>
              <div className="os-entity-title">Data discipline</div>
              <div className="os-entity-copy">
                Public Home shows the product map only. It does not invent sessions, installs, ratings, logs, secrets, credits, validators, or usage.
              </div>
            </div>
            <Badge>Public</Badge>
          </div>
        </Card>
      </section>
    </SurfaceShell>
  );
}

export default function HomePage() {
  const shell = useApplicationShell();
  const router = useRouter();
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [authState, setAuthState] = useState<BrowserSessionAuthState>('signed_out');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [command, setCommand] = useState('');
  const [payload, setPayload] = useState<DashboardPayload | null>(null);

  const load = useCallback(async (isActive: () => boolean = () => true) => {
    setError(null);
    try {
      const current = await withTimeout(
        fetchBrowserSessionState().catch(() => ({ state: 'signed_out' as const, session: null })),
        'Session request',
      );
      if (!isActive()) return;
      setSession(current.session);
      setAuthState(current.state);
      if (!current.session) {
        setPayload(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      const { response, authState: nextAuthState } = await fetchDashboardResponse(dashboardUrl(shell.activeWorkspaceId));
      if (!isActive()) return;
      setAuthState(nextAuthState);
      if (!response.ok) {
        setPayload(null);
        if (nextAuthState !== 'active') return;
        throw new Error('The dashboard route did not return workspace data.');
      }
      setPayload(await response.json());
    } catch (err) {
      if (!isActive()) return;
      setPayload(null);
      setError(err instanceof Error ? err.message : 'Home dashboard unavailable.');
    } finally {
      if (isActive()) setLoading(false);
    }
  }, [shell.activeWorkspaceId]);

  useEffect(() => {
    let active = true;
    void load(() => active);
    return () => {
      active = false;
    };
  }, [load]);

  const greeting = useMemo(() => {
    const name = session?.agentName?.trim() || 'there';
    return `${hourGreeting()} ${name}`;
  }, [session?.agentName]);

  function submitCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = command.trim();
    if (!next) {
      router.push('/studio?mode=nl');
      return;
    }
    router.push(`/studio?mode=nl&prompt=${encodeURIComponent(next)}`);
  }

  if (loading) {
    return (
      <SurfaceShell activePath="/">
        <LoadingState label="Loading workspace command overview" />
      </SurfaceShell>
    );
  }

  if (!session || authState === 'expired' || authState === 'signed_out') {
    return <SignedOutHome authState={authState} />;
  }

  if (error || !payload) {
    return (
      <SurfaceShell activePath="/">
        <ErrorState
          title="Home dashboard unavailable"
          body={error ?? 'AgentOS could not load the workspace dashboard.'}
          action={<Button onClick={() => void load()}>Retry</Button>}
        />
      </SurfaceShell>
    );
  }

  return (
    <SurfaceShell activePath="/">
      <section style={{ display: 'grid', gap: 18, minWidth: 0 }}>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Badge tone="accent">Super AgentOS</Badge>
            <Badge>{payload.workspace?.name ?? 'Workspace'}</Badge>
            <Badge>{payload.plan.label}</Badge>
          </div>
          <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 42px)', lineHeight: 1.08, letterSpacing: 0 }}>{greeting}</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            Home is your live command overview for sessions, projects, installed capabilities, incognito operators, Vault, MCP, and compute state.
          </p>
        </div>

        <form
          onSubmit={submitCommand}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
            gap: 10,
            alignItems: 'stretch',
          }}
        >
          <input
            value={command}
            onChange={event => setCommand(event.target.value)}
            className="os-input"
            placeholder="Message Super AgentOS"
            style={{ minHeight: 48 }}
          />
          <Button type="submit">Open Super AgentOS</Button>
        </form>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(138px, 1fr))', gap: 10 }}>
          {QUICK_ACTIONS.map(action => (
            <Link
              key={action.label}
              href={action.href}
              style={{
                minHeight: 42,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'rgba(255,255,255,0.02)',
                textDecoration: 'none',
              }}
            >
              <span>{action.label}</span>
              <span style={{ color: 'var(--text-tertiary)' }}>Open</span>
            </Link>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))', gap: 12 }}>
          <MetricCard label="Studio sessions" value={countState(payload.summary.sessions, 'session', 'sessions', 'No sessions')} hint="Recent NL Studio work" />
          <MetricCard label="Projects" value={countState(payload.summary.projects, 'project', 'projects', 'No projects')} hint="Durable context containers" />
          <MetricCard label="Installed apps" value={countState(payload.summary.installedApps, 'app', 'apps', 'No apps')} hint="SDK-backed app surfaces" />
          <MetricCard label="Installed skills" value={countState(payload.summary.installedSkills, 'skill', 'skills', 'No skills')} hint="Reusable capabilities" />
          <MetricCard label="Workflows" value={countState(payload.summary.workflows, 'workflow', 'workflows', 'No workflows')} hint="Execution graphs" />
          <MetricCard label="Incognito subagents" value={countState(payload.summary.privateSubagents, 'subagent', 'subagents', 'No subagents')} hint="Incognito user-created operators" />
          <MetricCard label="Vault health" value={payload.vault.total > 0 ? `${payload.vault.active}/${payload.vault.total} active` : 'No secrets'} hint="Secrets stay permissioned" />
          <MetricCard label="MCP status" value={payload.mcp.connectorCount > 0 ? `${payload.mcp.activeConnectors}/${payload.mcp.connectorCount} active` : 'No connectors'} hint="External tool layer" />
          <MetricCard label={payload.credits.label} value={payload.credits.available ? String(payload.credits.balance ?? 'Available') : 'Not connected'} hint={payload.credits.message} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 16 }}>
          <Section title="Recent Studio Sessions" actionHref="/studio?mode=nl" actionLabel="Open Studio">
            {payload.recentSessions.length > 0 ? (
              <ActivityFeed items={payload.recentSessions.map(item => ({
                id: item.id,
                title: item.title,
                subtitle: item.status,
                time: formatDate(item.updatedAt),
              }))} />
            ) : (
              <EmptyState title="No recent sessions" body="Start a chat in NL Studio and it will appear here." action={<Button href="/studio?mode=nl">Start chat</Button>} />
            )}
          </Section>

          <Section title="Active Projects" actionHref="/projects" actionLabel="All projects">
            {payload.activeProjects.length > 0 ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {payload.activeProjects.map(item => (
                  <LinkCard key={item.id} href={item.href} title={item.name} body={`Plan: ${item.plan}. Created ${formatDate(item.createdAt)}.`} />
                ))}
              </div>
            ) : (
              <EmptyState title="No active projects" body="Create a project to keep chats, assets, workflows, and context together." action={<Button href="/projects">Create project</Button>} />
            )}
          </Section>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 16 }}>
          <Section title="Installed Apps" actionHref="/appstore" actionLabel="Browse Appstore">
            {payload.installedApps.length > 0 ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {payload.installedApps.slice(0, 4).map(item => (
                  <LinkCard key={item.id} href={item.href} title={item.name} body={item.description} meta={<StatusPill status={item.healthStatus} />} />
                ))}
              </div>
            ) : (
              <EmptyState title="No installed apps" body="Install SDK apps from the Appstore to add product surfaces to your workspace." action={<Button href="/appstore">Open Appstore</Button>} />
            )}
          </Section>

          <Section title="Installed Skills" actionHref="/skillstore" actionLabel="Browse Skill Store">
            {payload.installedSkills.length > 0 ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {payload.installedSkills.slice(0, 4).map(item => (
                  <LinkCard key={item.id} href={`/skillstore/${encodeURIComponent(item.slug)}`} title={item.name} body={item.description} meta={<Badge tone="accent">{item.category}</Badge>} />
                ))}
              </div>
            ) : (
              <EmptyState title="No installed skills" body="Install skills to give Super AgentOS reusable capabilities." action={<Button href="/skillstore">Open Skill Store</Button>} />
            )}
          </Section>

          <Section title="Active Workflows" actionHref="/studio?mode=workflow" actionLabel="Open Builder">
            {payload.workflows.length > 0 ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {payload.workflows.slice(0, 4).map(item => (
                  <LinkCard key={item.id} href={`/workflows/${encodeURIComponent(item.id)}`} title={item.name} body={item.summary} meta={<StatusPill status={item.status} />} />
                ))}
              </div>
            ) : (
              <EmptyState title="No workflows" body="Build reusable execution graphs in Workflow Builder." action={<Button href="/studio?mode=workflow">Build workflow</Button>} />
            )}
          </Section>

          <Section title="Incognito Subagents" actionHref="/subagents" actionLabel="Manage">
            {payload.privateSubagents.length > 0 ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {payload.privateSubagents.slice(0, 4).map(item => (
                  <LinkCard
                    key={item.id}
                    href={item.href}
                    title={item.name}
                    body={item.description ?? 'Incognito operator'}
                    meta={<StatusPill status={item.visibility} />}
                  />
                ))}
              </div>
            ) : (
              <EmptyState title="No incognito subagents" body="Create incognito operators for scoped work inside your workspace." action={<Button href="/subagents">Create subagent</Button>} />
            )}
          </Section>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 16 }}>
          <Card style={{ padding: 16 }}>
            <div className="os-entity-head" style={{ marginBottom: 12 }}>
              <div>
                <div className="os-entity-title">Vault Health</div>
                <div className="os-entity-copy">Secrets remain permissioned and are not shown as memory.</div>
              </div>
              <Badge tone={payload.vault.active > 0 ? 'success' : 'default'}>
                {payload.vault.total > 0 ? `${payload.vault.active} active` : 'Empty'}
              </Badge>
            </div>
            <div className="os-entity-copy">Last update: {formatDate(payload.vault.lastUsedAt)}</div>
            <div className="os-inline-actions" style={{ marginTop: 12 }}>
              <Button href="/vault" variant="secondary">Open Vault</Button>
            </div>
          </Card>

          <Card style={{ padding: 16 }}>
            <div className="os-entity-head" style={{ marginBottom: 12 }}>
              <div>
                <div className="os-entity-title">MCP Status</div>
                <div className="os-entity-copy">Universal MCP connects external tools without making them Appstore apps.</div>
              </div>
              <Badge tone={payload.mcp.activeConnectors > 0 ? 'success' : 'default'}>
                {payload.mcp.connectorCount > 0 ? `${payload.mcp.activeConnectors} active` : 'No connectors'}
              </Badge>
            </div>
            <div className="os-entity-copy">Last call: {formatDate(payload.mcp.lastCallAt)}</div>
            <div className="os-inline-actions" style={{ marginTop: 12 }}>
              <Button href="/mcp" variant="secondary">Open Universal MCP</Button>
            </div>
          </Card>

          <Card style={{ padding: 16 }}>
            <div className="os-entity-head" style={{ marginBottom: 12 }}>
              <div>
                <div className="os-entity-title">{payload.credits.label}</div>
                <div className="os-entity-copy">{payload.credits.message}</div>
              </div>
              <Badge tone="warning">Disabled</Badge>
            </div>
            <Button disabled variant="secondary" disabledReason={payload.credits.message}>View usage</Button>
          </Card>
        </div>

        <Section title="Recommended Next Actions">
          {payload.recommendedActions.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12 }}>
              {payload.recommendedActions.map(action => (
                <LinkCard key={action.id} href={action.href} title={action.label} body={action.reason} />
              ))}
            </div>
          ) : (
            <EmptyState title="No recommendations" body="AgentOS has no workspace recommendation for the current state." />
          )}
        </Section>
      </section>
    </SurfaceShell>
  );
}
