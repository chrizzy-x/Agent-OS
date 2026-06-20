'use client';

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SurfaceShell from '@/components/os/surface-shell';
import GlobalSearch from '@/components/os/global-search';
import { useApplicationShell } from '@/components/os/application-shell';
import { ActivityFeed, Badge, Button, Card, EmptyState, LoadingState } from '@/components/os/ui';
import { fetchBrowserSessionState, fetchWithBrowserSession, type BrowserSession } from '@/src/auth/browser-session';

type HomePayload = {
  sessions: Array<{ id: string; workspaceId?: string; title: string; updatedAt: string }>;
  apps: Array<{ id: string; name: string; slug: string; description: string }>;
  skills: Array<{ id: string; name: string; slug: string; description: string }>;
  workflows: Array<{ id: string; name: string; summary: string | null; status: string }>;
  projects: Array<{ id: string; name: string; description: string; status: string; updatedAt: string; href: string }>;
  subagents: Array<{ id: string; name: string; description: string | null; visibility: string; updatedAt: string }>;
  summary: {
    subagents: number;
    installedSkills: number;
    connectedApps: number;
    privateWorkflows: number;
    recentActions: Array<{ id: string; type: string; summary: string; createdAt: string }>;
  };
};

const EMPTY_HOME: HomePayload = {
  sessions: [],
  apps: [],
  skills: [],
  workflows: [],
  projects: [],
  subagents: [],
  summary: {
    subagents: 0,
    installedSkills: 0,
    connectedApps: 0,
    privateWorkflows: 0,
    recentActions: [],
  },
};

const QUICK_ACTIONS = [
  { label: 'New Chat', href: '/studio?mode=nl' },
  { label: 'Create Project', href: '/projects?create=1' },
  { label: 'Run Workflow', href: '/workflows' },
  { label: 'Install App', href: '/appstore' },
  { label: 'Open Library', href: '/library' },
];

function hourGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Recently';
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
  } catch {
    return 'Recently';
  }
}

function Grid(props: { children: ReactNode; min?: number }) {
  return (
    <div style={{ display: 'grid', gap: 14, gridTemplateColumns: `repeat(auto-fit, minmax(${props.min ?? 220}px, 1fr))` }}>
      {props.children}
    </div>
  );
}

function HomeSection(props: { title: string; actionHref?: string; actionLabel?: string; children: ReactNode }) {
  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <div className="os-entity-head">
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{props.title}</h2>
        {props.actionHref && props.actionLabel ? <Link href={props.actionHref} className="btn-ghost">{props.actionLabel}</Link> : null}
      </div>
      {props.children}
    </section>
  );
}

function ContinueCard(props: { title: string; body: string; href: string; badge: string; empty?: boolean }) {
  return (
    <Link href={props.href} style={{ textDecoration: 'none' }}>
      <Card style={{ minHeight: 150, padding: 20 }}>
        <div className="os-entity-head">
          <div>
            <div className="os-entity-title">{props.title}</div>
            <div className="os-entity-copy" style={{ marginTop: 8 }}>{props.body}</div>
          </div>
          <Badge tone={props.empty ? 'default' : 'accent'}>{props.badge}</Badge>
        </div>
      </Card>
    </Link>
  );
}

function PublicLanding() {
  return (
    <SurfaceShell activePath="/">
      <section style={{ display: 'grid', gap: 28, padding: '52px 0 72px' }}>
        <Badge tone="accent">AgentOS v6.6.4</Badge>
        <div style={{ display: 'grid', gap: 16, maxWidth: 760 }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(42px, 7vw, 76px)', lineHeight: 0.95, letterSpacing: 0 }}>AgentOS</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 18, lineHeight: 1.8 }}>
            Projects create context. Assets provide capability. Workflows provide execution.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/signup" className="btn-primary">Get started</Link>
          <Link href="/studio" className="btn-outline">Open Studio</Link>
          <Link href="/appstore" className="btn-outline">Browse App Store</Link>
        </div>
      </section>
    </SurfaceShell>
  );
}

export default function HomePage() {
  const shell = useApplicationShell();
  const router = useRouter();
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [command, setCommand] = useState('');
  const [payload, setPayload] = useState<HomePayload>(EMPTY_HOME);

  useEffect(() => {
    let active = true;

    async function load() {
      const auth = await fetchBrowserSessionState().catch(() => ({ state: 'signed_out' as const, session: null }));
      if (!active) return;
      setSession(auth.session);
      if (!auth.session) {
        setLoading(false);
        return;
      }

      const [sessionsRes, appsRes, skillsRes, workflowsRes, projectsRes, superAgentRes, subagentsRes] = await Promise.all([
        fetchWithBrowserSession('/api/studio/sessions?status=active', { cache: 'no-store' }),
        fetchWithBrowserSession(`/api/apps/installed${shell.activeWorkspaceId ? `?workspaceId=${encodeURIComponent(shell.activeWorkspaceId)}` : ''}`, { cache: 'no-store' }),
        fetchWithBrowserSession('/api/skills/installed', { cache: 'no-store' }),
        fetchWithBrowserSession(`/api/agent/workflows${shell.activeWorkspaceId ? `?workspaceId=${encodeURIComponent(shell.activeWorkspaceId)}` : ''}`, { cache: 'no-store' }),
        fetchWithBrowserSession(`/api/projects${shell.activeWorkspaceId ? `?workspace=${encodeURIComponent(shell.activeWorkspaceId)}` : ''}`, { cache: 'no-store' }),
        fetchWithBrowserSession('/api/super-agent', { cache: 'no-store' }),
        fetchWithBrowserSession(`/api/subagents${shell.activeWorkspaceId ? `?workspaceId=${encodeURIComponent(shell.activeWorkspaceId)}` : ''}`, { cache: 'no-store' }),
      ]);

      if (!active) return;
      const [sessionsBody, appsBody, skillsBody, workflowsBody, projectsBody, superAgentBody, subagentsBody] = await Promise.all([
        sessionsRes.response.ok ? sessionsRes.response.json() : Promise.resolve({}),
        appsRes.response.ok ? appsRes.response.json() : Promise.resolve({}),
        skillsRes.response.ok ? skillsRes.response.json() : Promise.resolve({}),
        workflowsRes.response.ok ? workflowsRes.response.json() : Promise.resolve({}),
        projectsRes.response.ok ? projectsRes.response.json() : Promise.resolve({}),
        superAgentRes.response.ok ? superAgentRes.response.json() : Promise.resolve({}),
        subagentsRes.response.ok ? subagentsRes.response.json() : Promise.resolve({}),
      ]);

      setPayload({
        sessions: (sessionsBody.sessions ?? []).filter((item: { workspaceId?: string }) => !shell.activeWorkspaceId || item.workspaceId === shell.activeWorkspaceId).slice(0, 6),
        apps: (appsBody.installedApps ?? []).map((item: { app?: { id?: string; name?: string; slug?: string; description?: string } }, index: number) => ({
          id: String(item.app?.id ?? `app-${index}`),
          name: String(item.app?.name ?? 'App'),
          slug: String(item.app?.slug ?? `app-${index}`),
          description: String(item.app?.description ?? 'Installed app'),
        })).slice(0, 6),
        skills: ((skillsBody.installed_skills ?? []) as Array<{ skill?: Record<string, unknown> }>).map((item, index) => ({
          id: String(item.skill?.id ?? item.skill?.slug ?? `skill-${index}`),
          name: String(item.skill?.name ?? 'Skill'),
          slug: String(item.skill?.slug ?? `skill-${index}`),
          description: String(item.skill?.description ?? 'Installed capability'),
        })).slice(0, 6),
        workflows: (workflowsBody.workflows ?? []).slice(0, 6),
        projects: (projectsBody.projects ?? []).slice(0, 6),
        subagents: (subagentsBody.subagents ?? []).slice(0, 6),
        summary: {
          subagents: Number(superAgentBody.summary?.subagents ?? 0),
          installedSkills: Number(superAgentBody.summary?.installedSkills ?? 0),
          connectedApps: Number(superAgentBody.summary?.connectedApps ?? 0),
          privateWorkflows: Number(superAgentBody.summary?.privateWorkflows ?? 0),
          recentActions: superAgentBody.summary?.recentActions ?? [],
        },
      });
      setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, [shell.activeWorkspaceId]);

  const greeting = useMemo(() => `${hourGreeting()}, ${session?.agentName?.trim() || 'Riz'}`, [session?.agentName]);

  function submitCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = command.trim();
    router.push(next ? `/studio?mode=nl&prompt=${encodeURIComponent(next)}` : '/studio?mode=nl');
  }

  if (!session && !loading) return <PublicLanding />;

  if (loading && !session) {
    return (
      <SurfaceShell activePath="/">
        <LoadingState label="Loading AgentOS home" />
      </SurfaceShell>
    );
  }

  const chat = payload.sessions[0];
  const project = payload.projects[0];
  const workflow = payload.workflows[0];
  const pinnedAssets = [
    ...payload.apps.map(item => ({ id: item.id, name: item.name, description: item.description, kind: 'App', href: '/library?section=apps' })),
    ...payload.skills.map(item => ({ id: item.id, name: item.name, description: item.description, kind: 'Skill', href: '/library?section=skills' })),
    ...payload.subagents.map(item => ({ id: item.id, name: item.name, description: item.description ?? 'AI teammate', kind: 'Subagent', href: '/library?section=subagents' })),
  ].slice(0, 8);

  return (
    <SurfaceShell activePath="/">
      <section style={{ display: 'grid', gap: 22 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, letterSpacing: 0 }}>{greeting}</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Workspace Overview</p>
        </div>

        <GlobalSearch />

        <form onSubmit={submitCommand} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10 }}>
          <input value={command} onChange={event => setCommand(event.target.value)} className="os-input" placeholder="Message AgentOS" style={{ minHeight: 48 }} />
          <Button type="submit">Send</Button>
        </form>

        <Grid min={130}>
          {QUICK_ACTIONS.map(action => (
            <Link key={action.label} href={action.href} className="btn-ghost" style={{ justifyContent: 'space-between' }}>
              <span>{action.label}</span>
              <span>Open</span>
            </Link>
          ))}
        </Grid>

        <Grid min={260}>
          <ContinueCard title="Continue Chat" body={chat ? `${chat.title} - ${formatDate(chat.updatedAt)}` : 'Start a conversation in Studio.'} href={chat ? `/studio?session=${encodeURIComponent(chat.id)}` : '/studio'} badge="Chat" empty={!chat} />
          <ContinueCard title="Continue Project" body={project ? `${project.name} - ${project.description}` : 'Create context for assets, memory, and workflows.'} href={project?.href ?? '/projects'} badge="Project" empty={!project} />
          <ContinueCard title="Continue Workflow" body={workflow ? `${workflow.name} - ${workflow.summary ?? workflow.status}` : 'Turn workspace context into repeatable execution.'} href={workflow ? `/workflows/${encodeURIComponent(workflow.id)}` : '/workflows'} badge="Workflow" empty={!workflow} />
        </Grid>

        <HomeSection title="Metrics">
          <Grid min={150}>
            {[
              { label: 'Projects', value: payload.projects.length, href: '/projects' },
              { label: 'Installed Apps', value: payload.summary.connectedApps, href: '/library?section=apps' },
              { label: 'Workflows', value: payload.summary.privateWorkflows, href: '/workflows' },
              { label: 'Subagents', value: payload.summary.subagents, href: '/library?section=subagents' },
            ].map(item => (
              <Link key={item.label} href={item.href} style={{ textDecoration: 'none' }}>
                <Card style={{ padding: 14 }}>
                  <div className="os-entity-meta">{item.label}</div>
                  <div style={{ fontSize: 26, fontWeight: 700 }}>{item.value}</div>
                </Card>
              </Link>
            ))}
          </Grid>
        </HomeSection>

        <HomeSection title="Pinned Assets" actionHref="/library" actionLabel="Library">
          {pinnedAssets.length ? (
            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 6 }}>
              {pinnedAssets.map(item => (
                <Link key={`${item.kind}-${item.id}`} href={item.href} style={{ minWidth: 220, textDecoration: 'none' }}>
                  <Card style={{ padding: 14 }}>
                    <div className="os-entity-head">
                      <div>
                        <div className="os-entity-title">{item.name}</div>
                        <div className="os-entity-copy">{item.description}</div>
                      </div>
                      <Badge>{item.kind}</Badge>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="No pinned assets" body="Apps, skills, and subagents appear here after installation." action={<Button href="/appstore">Open App Store</Button>} />
          )}
        </HomeSection>

        <Grid min={280}>
          <HomeSection title="Recent Activity">
            <ActivityFeed
              items={(payload.summary.recentActions.length ? payload.summary.recentActions : payload.sessions).slice(0, 5).map(item => ({
                id: item.id,
                title: 'summary' in item ? item.summary : item.title,
                subtitle: 'type' in item ? item.type : 'Chat',
                time: formatDate('createdAt' in item ? item.createdAt : item.updatedAt),
              }))}
            />
          </HomeSection>
          <HomeSection title="Recent Installs">
            <div style={{ display: 'grid', gap: 10 }}>
              {pinnedAssets.slice(0, 5).map(item => (
                <Card key={`install-${item.kind}-${item.id}`} style={{ padding: 12 }}>
                  <div className="os-entity-head">
                    <div>
                      <div className="os-entity-title">{item.name}</div>
                      <div className="os-entity-copy">{item.description}</div>
                    </div>
                    <Badge>{item.kind}</Badge>
                  </div>
                </Card>
              ))}
              {!pinnedAssets.length ? <div className="os-empty-body">No recent installs.</div> : null}
            </div>
          </HomeSection>
          <HomeSection title="AgentOS Updates">
            <Card style={{ padding: 16 }}>
              <div className="os-entity-head">
                <div>
                  <div className="os-entity-title">AgentOS v6.6.4</div>
                  <div className="os-entity-copy">Workspace architecture, Library ownership, unified navigation, and App Store discovery.</div>
                </div>
                <Badge tone="accent">Latest</Badge>
              </div>
            </Card>
          </HomeSection>
        </Grid>
      </section>
    </SurfaceShell>
  );
}
