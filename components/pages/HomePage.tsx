'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import SurfaceShell from '@/components/os/surface-shell';
import { Badge, Button, Card, EmptyState } from '@/components/os/ui';
import { fetchBrowserSessionState, fetchWithBrowserSession, type BrowserSession } from '@/src/auth/browser-session';

type HomePayload = {
  sessions: Array<{ id: string; title: string; updatedAt: string }>;
  apps: Array<{ id: string; name: string; slug: string; description: string }>;
  skills: Array<{ id: string; name: string; slug: string; description: string }>;
  workflows: Array<{ id: string; name: string; summary: string | null; status: string }>;
};

const QUICK_ACTIONS = [
  { label: 'Research', href: '/studio?mode=nl&prompt=Research%20this%20project' },
  { label: 'Build', href: '/studio?mode=code' },
  { label: 'Analyze', href: '/studio?mode=nl&prompt=Analyze%20the%20current%20project' },
  { label: 'Trade', href: '/studio?mode=nl&prompt=Scan%20the%20market' },
  { label: 'Create Workflow', href: '/workflows' },
  { label: 'Install App', href: '/appstore' },
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
        <Badge tone="accent">AgentOS v6.3</Badge>
        <div style={{ display: 'grid', gap: 16, maxWidth: 760 }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(42px, 7vw, 76px)', lineHeight: 0.95, letterSpacing: '-0.05em' }}>
            AgentOS is the operating system for the agent economy.
          </h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 18, lineHeight: 1.8 }}>
            Chat, build, install, route, publish, and operate agents, apps, skills, workflows, and MCP tools from one workspace.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/signup" className="btn-primary">Get AgentOS</Link>
          <Link href="/studio" className="btn-outline">Open Studio</Link>
          <Link href="/marketplace" className="btn-outline">Open Marketplace</Link>
        </div>
        <Card style={{ padding: 24, display: 'grid', gap: 12 }}>
          <Badge tone="accent">Router</Badge>
          <strong style={{ fontSize: 20 }}>Human -&gt; AgentOS Router -&gt; Agents / Apps / Skills / Workflows / MCP Tools</strong>
          <span style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            AgentOS is the router between humans and AI systems, the workspace where they operate, and the discovery layer where apps and skills become installable assets.
          </span>
        </Card>
        <Grid>
          <Card style={{ padding: 22 }}>
            <div style={{ display: 'grid', gap: 10 }}>
              <Badge tone="accent">Positioning</Badge>
              <strong>Not another chatbot.</strong>
              <span style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                AgentOS is not a wrapper around one assistant. It routes work across sessions, agents, apps, skills, workflows, and MCP tools.
              </span>
            </div>
          </Card>
          <Card style={{ padding: 22 }}>
            <div style={{ display: 'grid', gap: 10 }}>
              <Badge tone="accent">Runtime</Badge>
              <strong>Not another agent builder.</strong>
              <span style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                AgentOS is the operating layer where agents, workflows, skills, apps, and memory run inside one workspace instead of one builder surface.
              </span>
            </div>
          </Card>
          <Card style={{ padding: 22 }}>
            <div style={{ display: 'grid', gap: 10 }}>
              <Badge tone="accent">Distribution</Badge>
              <strong>One runtime for the agent economy.</strong>
              <span style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                Build once. Discover everywhere. Apps built inside or outside AgentOS can register through the SDK and appear in the marketplace beside monetizable skills and workflows.
              </span>
            </div>
          </Card>
        </Grid>
        <Grid>
          <Card style={{ padding: 22 }}>
            <div style={{ display: 'grid', gap: 10 }}>
              <Badge tone="accent">Marketplace</Badge>
              <strong>Build once. Discover everywhere.</strong>
              <span style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                The App Store and Skill Store are first-class discovery layers. Install public assets, keep private assets scoped to your workspace, then publish when eligible.
              </span>
            </div>
          </Card>
          <Card style={{ padding: 22 }}>
            <div style={{ display: 'grid', gap: 10 }}>
              <Badge tone="accent">Super AgentOS</Badge>
              <strong>Your personal Super AgentOS controls sessions, memory, tools, apps, and workflows.</strong>
              <span style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                It owns your instructions, installed skills, connected apps, private workflows, and recent actions across every conversation and project.
              </span>
            </div>
          </Card>
        </Grid>
        <Card style={{ padding: 24, display: 'grid', gap: 12 }}>
          <Badge tone="accent">Economy Layer</Badge>
          <strong>Skills and apps are monetizable assets.</strong>
          <span style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            AgentOS treats apps, skills, and workflows as installable, publishable assets that can move from private workspace use into broader discovery and monetization paths.
          </span>
        </Card>
      </section>
    </SurfaceShell>
  );
}

export default function HomePage() {
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<HomePayload>({
    sessions: [],
    apps: [],
    skills: [],
    workflows: [],
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

      const [sessionsRes, appsRes, skillsRes, workflowsRes] = await Promise.all([
        fetchWithBrowserSession('/api/studio/sessions?status=active', { cache: 'no-store' }),
        fetchWithBrowserSession('/api/apps/installed', { cache: 'no-store' }),
        fetchWithBrowserSession('/api/skills/installed', { cache: 'no-store' }),
        fetchWithBrowserSession('/api/agent/workflows', { cache: 'no-store' }),
      ]);

      if (!active) return;

      const [sessionsBody, appsBody, skillsBody, workflowsBody] = await Promise.all([
        sessionsRes.response.ok ? sessionsRes.response.json() : Promise.resolve({}),
        appsRes.response.ok ? appsRes.response.json() : Promise.resolve({}),
        skillsRes.response.ok ? skillsRes.response.json() : Promise.resolve({}),
        workflowsRes.response.ok ? workflowsRes.response.json() : Promise.resolve({}),
      ]);

      setPayload({
        sessions: (sessionsBody.sessions ?? []).slice(0, 4),
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
      });
      setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const greeting = useMemo(() => {
    const name = session?.agentName?.trim() || 'there';
    return `${hourGreeting()} ${name}`;
  }, [session?.agentName]);

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
      <section style={{ display: 'grid', gap: 28 }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <Badge tone="accent">Super AgentOS</Badge>
          <h1 style={{ margin: 0, fontSize: 'clamp(34px, 5vw, 56px)', letterSpacing: '-0.05em' }}>{greeting}</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 18, lineHeight: 1.8 }}>
            What would you like your Super AgentOS to do?
          </p>
        </div>

        <HomeSection title="Quick Actions">
          <Grid>
            {QUICK_ACTIONS.map(action => (
              <Link
                key={action.label}
                href={action.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '18px 20px',
                  borderRadius: 18,
                  border: '1px solid var(--border)',
                  background: 'rgba(255,255,255,0.02)',
                  textDecoration: 'none',
                }}
              >
                <span>{action.label}</span>
                <span style={{ color: 'var(--text-tertiary)' }}>Open</span>
              </Link>
            ))}
          </Grid>
        </HomeSection>

        <HomeSection title="Recent Chats" actionHref="/studio" actionLabel="Open Studio">
          {payload.sessions.length > 0 ? (
            <Grid>
              {payload.sessions.map(item => (
                <Card key={item.id} style={{ padding: 18 }}>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <strong>{item.title}</strong>
                    <span style={{ color: 'var(--text-secondary)' }}>{formatDate(item.updatedAt)}</span>
                  </div>
                </Card>
              ))}
            </Grid>
          ) : (
            <EmptyState title="No chats yet" body="Start in Studio and your recent sessions will show up here." action={<Button href="/studio">Open Studio</Button>} />
          )}
        </HomeSection>

        <HomeSection title="Installed Apps" actionHref="/appstore" actionLabel="Open App Store">
          {payload.apps.length > 0 ? (
            <Grid>
              {payload.apps.map(item => (
                <Card key={item.id} style={{ padding: 18 }}>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <strong>{item.name}</strong>
                    <span style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>{item.description}</span>
                  </div>
                </Card>
              ))}
            </Grid>
          ) : (
            <EmptyState title="No apps installed" body="Install an app when your Super AgentOS needs a product surface." action={<Button href="/appstore">Browse apps</Button>} />
          )}
        </HomeSection>

        <HomeSection title="Installed Skills" actionHref="/skills" actionLabel="Open Skill Store">
          {payload.skills.length > 0 ? (
            <Grid>
              {payload.skills.map(item => (
                <Card key={item.id} style={{ padding: 18 }}>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <strong>{item.name}</strong>
                    <span style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>{item.description}</span>
                  </div>
                </Card>
              ))}
            </Grid>
          ) : (
            <EmptyState title="No skills installed" body="Install capabilities your Super AgentOS can use on demand." action={<Button href="/skills">Browse skills</Button>} />
          )}
        </HomeSection>

        <HomeSection title="Recent Workflows" actionHref="/workflows" actionLabel="Open Workflows">
          {payload.workflows.length > 0 ? (
            <Grid>
              {payload.workflows.map(item => (
                <Card key={item.id} style={{ padding: 18 }}>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <strong>{item.name}</strong>
                    <span style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>{item.summary ?? item.status}</span>
                  </div>
                </Card>
              ))}
            </Grid>
          ) : (
            <EmptyState title="No workflows yet" body="Turn repeated work into a reusable run when you are ready." action={<Button href="/workflows">Create workflow</Button>} />
          )}
        </HomeSection>

        <HomeSection title="Activity">
          <Grid>
            {[
              { title: 'Studio', copy: payload.sessions[0] ? `Last active ${formatDate(payload.sessions[0].updatedAt)}` : 'Open Studio to begin.' },
              { title: 'Apps', copy: payload.apps.length > 0 ? `${payload.apps.length} installed` : 'Nothing installed yet.' },
              { title: 'Skills', copy: payload.skills.length > 0 ? `${payload.skills.length} installed` : 'No skills installed yet.' },
            ].map(item => (
              <Card key={item.title} style={{ padding: 18 }}>
                <div style={{ display: 'grid', gap: 8 }}>
                  <strong>{item.title}</strong>
                  <span style={{ color: 'var(--text-secondary)' }}>{item.copy}</span>
                </div>
              </Card>
            ))}
          </Grid>
        </HomeSection>
      </section>
    </SurfaceShell>
  );
}
