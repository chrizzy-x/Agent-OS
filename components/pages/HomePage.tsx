'use client';

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SurfaceShell from '@/components/os/surface-shell';
import { useApplicationShell } from '@/components/os/application-shell';
import { Badge, Button, Card, EmptyState } from '@/components/os/ui';
import { fetchBrowserSessionState, fetchWithBrowserSession, type BrowserSession } from '@/src/auth/browser-session';

type HomePayload = {
  sessions: Array<{ id: string; workspaceId?: string; title: string; updatedAt: string }>;
  apps: Array<{ id: string; name: string; slug: string; description: string }>;
  skills: Array<{ id: string; name: string; slug: string; description: string }>;
  workflows: Array<{ id: string; name: string; summary: string | null; status: string; visibility?: string }>;
  projects: Array<{ id: string; name: string; description: string; status: string; updatedAt: string; href: string }>;
  subagents: Array<{ id: string; name: string; description: string | null; visibility: string; updatedAt: string }>;
  memoryEntries: Array<{ id: string; key: string; visibility: string; namespaceType: string; updatedAt: string }>;
  files: Array<{ id: string; path: string; visibility: string; metadata: Record<string, unknown> }>;
  summary: {
    activeSessions: number;
    subagents: number;
    memoryEntries: number;
    files: number;
    installedSkills: number;
    connectedApps: number;
    privateWorkflows: number;
    visibility: Record<string, Record<string, number>>;
    recentActions: Array<{ id: string; type: string; summary: string; createdAt: string }>;
  };
};

const QUICK_ACTIONS = [
  { label: 'New chat', href: '/studio?mode=nl' },
  { label: 'Workflow Studio', href: '/studio?mode=workflow' },
  { label: 'Code Studio', href: '/studio?mode=code' },
  { label: 'Create project', href: '/projects' },
  { label: 'Install app', href: '/appstore' },
  { label: 'Install skill', href: '/skills' },
  { label: 'Library', href: '/library' },
];

function hourGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Recently';
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return 'Recently';
  }
}

function Grid(props: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gap: 14,
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      }}
    >
      {props.children}
    </div>
  );
}

function ToneForVisibility(value: string): 'accent' | 'default' | 'success' {
  if (value === 'public') return 'success';
  if (value === 'workspace') return 'accent';
  return 'default';
}

function HomeSection(props: {
  title: string;
  actionHref?: string;
  actionLabel?: string;
  children: ReactNode;
}) {
  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>{props.title}</h2>
        {props.actionHref && props.actionLabel ? (
          <Link href={props.actionHref} style={{ color: 'var(--text-secondary)', fontSize: 14, textDecoration: 'none' }}>
            {props.actionLabel}
          </Link>
        ) : null}
      </div>
      {props.children}
    </section>
  );
}

function PublicLanding() {
  return (
    <SurfaceShell activePath="/">
      <section style={{ display: 'grid', gap: 28, padding: '52px 0 72px' }}>
        <Badge tone="accent">AgentOS V6.6.2</Badge>
        <div style={{ display: 'grid', gap: 16, maxWidth: 760 }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(42px, 7vw, 76px)', lineHeight: 0.95, letterSpacing: '-0.05em' }}>
            Your AI operating system.
          </h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 18, lineHeight: 1.8 }}>
            Talk to it. Build with it. Install what it needs.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/signup" className="btn-primary">Get started</Link>
          <Link href="/studio" className="btn-outline">Open Studio</Link>
          <Link href="/appstore" className="btn-outline">Browse apps</Link>
        </div>
        <Grid>
          <Card style={{ padding: 22 }}>
            <div style={{ display: 'grid', gap: 10 }}>
              <Badge tone="accent">Chat</Badge>
              <strong>Start with a conversation.</strong>
              <span style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                Ask your Super AgentOS to research, analyze, create, or plan without setting up a workflow first.
              </span>
            </div>
          </Card>
          <Card style={{ padding: 22 }}>
            <div style={{ display: 'grid', gap: 10 }}>
              <Badge tone="accent">Build</Badge>
              <strong>Switch into Code Studio when you need it.</strong>
              <span style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                The same session, project, memory, apps, skills, and Vault stay with you in both Studio modes.
              </span>
            </div>
          </Card>
          <Card style={{ padding: 22 }}>
            <div style={{ display: 'grid', gap: 10 }}>
              <Badge tone="accent">Install</Badge>
              <strong>Give your Super AgentOS new capabilities.</strong>
              <span style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                Install apps for product surfaces and skills for new abilities, then use them from one workspace.
              </span>
            </div>
          </Card>
        </Grid>
        <Card style={{ padding: 24, display: 'grid', gap: 12 }}>
          <Badge tone="accent">One system</Badge>
          <strong>Everything belongs to your Super AgentOS.</strong>
          <span style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            Home, Studio, projects, memory, Vault, workflows, apps, skills, and activity all work as one operating system.
          </span>
        </Card>
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
  const [payload, setPayload] = useState<HomePayload>({
    sessions: [],
    apps: [],
    skills: [],
    workflows: [],
    projects: [],
    subagents: [],
    memoryEntries: [],
    files: [],
    summary: {
      activeSessions: 0,
      subagents: 0,
      memoryEntries: 0,
      files: 0,
      installedSkills: 0,
      connectedApps: 0,
      privateWorkflows: 0,
      visibility: {},
      recentActions: [],
    },
  });

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

      const [sessionsRes, appsRes, skillsRes, workflowsRes, projectsRes, superAgentRes, subagentsRes, memoryRes, filesRes] = await Promise.all([
        fetchWithBrowserSession('/api/studio/sessions?status=active', { cache: 'no-store' }),
        fetchWithBrowserSession(`/api/apps/installed${shell.activeWorkspaceId ? `?workspaceId=${encodeURIComponent(shell.activeWorkspaceId)}` : ''}`, { cache: 'no-store' }),
        fetchWithBrowserSession('/api/skills/installed', { cache: 'no-store' }),
        fetchWithBrowserSession(`/api/agent/workflows${shell.activeWorkspaceId ? `?workspaceId=${encodeURIComponent(shell.activeWorkspaceId)}` : ''}`, { cache: 'no-store' }),
        fetchWithBrowserSession(`/api/projects${shell.activeWorkspaceId ? `?workspace=${encodeURIComponent(shell.activeWorkspaceId)}` : ''}`, { cache: 'no-store' }),
        fetchWithBrowserSession('/api/super-agent', { cache: 'no-store' }),
        fetchWithBrowserSession(`/api/subagents${shell.activeWorkspaceId ? `?workspaceId=${encodeURIComponent(shell.activeWorkspaceId)}` : ''}`, { cache: 'no-store' }),
        fetchWithBrowserSession(`/api/memory?limit=4${shell.activeWorkspaceId ? `&workspaceId=${encodeURIComponent(shell.activeWorkspaceId)}` : ''}`, { cache: 'no-store' }),
        fetchWithBrowserSession(`/api/files?limit=4${shell.activeWorkspaceId ? `&workspaceId=${encodeURIComponent(shell.activeWorkspaceId)}` : ''}`, { cache: 'no-store' }),
      ]);

      if (!active) return;

      const [sessionsBody, appsBody, skillsBody, workflowsBody, projectsBody, superAgentBody, subagentsBody, memoryBody, filesBody] = await Promise.all([
        sessionsRes.response.ok ? sessionsRes.response.json() : Promise.resolve({}),
        appsRes.response.ok ? appsRes.response.json() : Promise.resolve({}),
        skillsRes.response.ok ? skillsRes.response.json() : Promise.resolve({}),
        workflowsRes.response.ok ? workflowsRes.response.json() : Promise.resolve({}),
        projectsRes.response.ok ? projectsRes.response.json() : Promise.resolve({}),
        superAgentRes.response.ok ? superAgentRes.response.json() : Promise.resolve({}),
        subagentsRes.response.ok ? subagentsRes.response.json() : Promise.resolve({}),
        memoryRes.response.ok ? memoryRes.response.json() : Promise.resolve({}),
        filesRes.response.ok ? filesRes.response.json() : Promise.resolve({}),
      ]);

      setPayload({
        sessions: (sessionsBody.sessions ?? []).filter((item: { workspaceId?: string }) => !shell.activeWorkspaceId || item.workspaceId === shell.activeWorkspaceId).slice(0, 4),
        apps: (appsBody.installedApps ?? []).slice(0, 4),
        skills: ((skillsBody.installed_skills ?? []) as Array<{ skill?: Record<string, unknown> }>)
          .map((item, index) => ({
            id: String(item.skill?.id ?? item.skill?.slug ?? `skill-${index}`),
            name: String(item.skill?.name ?? 'Skill'),
            slug: String(item.skill?.slug ?? `skill-${index}`),
            description: String(item.skill?.description ?? 'Installed capability'),
          }))
          .slice(0, 4),
        workflows: (workflowsBody.workflows ?? []).slice(0, 4),
        projects: (projectsBody.projects ?? []).slice(0, 4),
        subagents: (subagentsBody.subagents ?? []).slice(0, 4),
        memoryEntries: (memoryBody.entries ?? []).slice(0, 4),
        files: (filesBody.entries ?? []).slice(0, 4),
        summary: {
          activeSessions: Number(superAgentBody.summary?.activeSessions ?? 0),
          subagents: Number(superAgentBody.summary?.subagents ?? 0),
          memoryEntries: Number(superAgentBody.summary?.memoryEntries ?? 0),
          files: Number(superAgentBody.summary?.files ?? 0),
          installedSkills: Number(superAgentBody.summary?.installedSkills ?? 0),
          connectedApps: Number(superAgentBody.summary?.connectedApps ?? 0),
          privateWorkflows: Number(superAgentBody.summary?.privateWorkflows ?? 0),
          visibility: superAgentBody.summary?.visibility ?? {},
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

  if (!session && !loading) {
    return <PublicLanding />;
  }

  if (loading && !session) {
    return (
      <SurfaceShell activePath="/">
        <div style={{ padding: '80px 0', color: 'var(--text-secondary)' }}>Loading your AgentOS…</div>
      </SurfaceShell>
    );
  }

  return (
    <SurfaceShell activePath="/">
      <section style={{ display: 'grid', gap: 18 }}>
        <div style={{ display: 'grid', gap: 10 }}>
          <Badge tone="accent">Super AgentOS</Badge>
          <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 42px)', letterSpacing: 0 }}>{greeting}</h1>
        </div>

        <form onSubmit={submitCommand} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10 }}>
          <input
            value={command}
            onChange={event => setCommand(event.target.value)}
            className="os-input"
            placeholder="Message Super AgentOS"
            style={{ minHeight: 48 }}
          />
          <Button type="submit">Send</Button>
        </form>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          <HomeSection title="Recent Chats" actionHref="/studio" actionLabel="Open Studio">
            {payload.sessions.length > 0 ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {payload.sessions.map(item => (
                  <Link key={item.id} href={`/studio?session=${encodeURIComponent(item.id)}`} style={{ textDecoration: 'none' }}>
                    <Card style={{ padding: 12 }}>
                      <div className="os-entity-head">
                        <strong>{item.title}</strong>
                        <span className="os-entity-meta">{formatDate(item.updatedAt)}</span>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="No chats yet" body="Start in Studio and recent sessions show here." action={<Button href="/studio">Open Studio</Button>} />
            )}
          </HomeSection>

          <HomeSection title="Projects" actionHref="/projects" actionLabel="All Projects">
            {payload.projects.length > 0 ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {payload.projects.map(item => (
                  <Link key={item.id} href={item.href} style={{ textDecoration: 'none' }}>
                    <Card style={{ padding: 12 }}>
                      <div className="os-entity-head">
                        <div>
                          <strong>{item.name}</strong>
                          <div className="os-entity-copy">{item.description}</div>
                        </div>
                        <Badge tone={item.status === 'active' ? 'success' : 'warning'}>{item.status}</Badge>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="No projects yet" body="Create a project to organize chats, assets, memory, secrets, and MCP." action={<Button href="/projects">Projects</Button>} />
            )}
          </HomeSection>
        </div>

        <HomeSection title="Context">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            {[
              { label: 'Apps', value: payload.summary.connectedApps, href: '/apps' },
              { label: 'Skills', value: payload.summary.installedSkills, href: '/skills/installed' },
              { label: 'Workflows', value: payload.summary.privateWorkflows, href: '/workflows' },
              { label: 'Memory', value: payload.summary.memoryEntries, href: '/memory' },
              { label: 'Files', value: payload.summary.files, href: '/files' },
              { label: 'Subagents', value: payload.summary.subagents, href: '/agents' },
            ].map(item => (
              <Link key={item.label} href={item.href} style={{ textDecoration: 'none' }}>
                <Card style={{ padding: 12 }}>
                  <div className="os-entity-meta">{item.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{item.value}</div>
                </Card>
              </Link>
            ))}
          </div>
        </HomeSection>
      </section>
    </SurfaceShell>
  );
}
