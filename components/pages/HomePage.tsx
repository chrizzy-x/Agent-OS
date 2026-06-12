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
  workflows: Array<{ id: string; name: string; summary: string | null; status: string; visibility?: string }>;
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
        <Badge tone="accent">AgentOS v6.5.1</Badge>
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
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<HomePayload>({
    sessions: [],
    apps: [],
    skills: [],
    workflows: [],
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

      const [sessionsRes, appsRes, skillsRes, workflowsRes, superAgentRes, subagentsRes, memoryRes, filesRes] = await Promise.all([
        fetchWithBrowserSession('/api/studio/sessions?status=active', { cache: 'no-store' }),
        fetchWithBrowserSession('/api/apps/installed', { cache: 'no-store' }),
        fetchWithBrowserSession('/api/skills/installed', { cache: 'no-store' }),
        fetchWithBrowserSession('/api/agent/workflows', { cache: 'no-store' }),
        fetchWithBrowserSession('/api/super-agent', { cache: 'no-store' }),
        fetchWithBrowserSession('/api/subagents', { cache: 'no-store' }),
        fetchWithBrowserSession('/api/memory?limit=4', { cache: 'no-store' }),
        fetchWithBrowserSession('/api/files?limit=4', { cache: 'no-store' }),
      ]);

      if (!active) return;

      const [sessionsBody, appsBody, skillsBody, workflowsBody, superAgentBody, subagentsBody, memoryBody, filesBody] = await Promise.all([
        sessionsRes.response.ok ? sessionsRes.response.json() : Promise.resolve({}),
        appsRes.response.ok ? appsRes.response.json() : Promise.resolve({}),
        skillsRes.response.ok ? skillsRes.response.json() : Promise.resolve({}),
        workflowsRes.response.ok ? workflowsRes.response.json() : Promise.resolve({}),
        superAgentRes.response.ok ? superAgentRes.response.json() : Promise.resolve({}),
        subagentsRes.response.ok ? subagentsRes.response.json() : Promise.resolve({}),
        memoryRes.response.ok ? memoryRes.response.json() : Promise.resolve({}),
        filesRes.response.ok ? filesRes.response.json() : Promise.resolve({}),
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

        <HomeSection title="System Summary">
          <Grid>
            {[
              { title: 'Active chats', value: payload.summary.activeSessions, href: '/studio' },
              { title: 'Subagents', value: payload.summary.subagents, href: '/agents' },
              { title: 'Memory entries', value: payload.summary.memoryEntries, href: '/memory' },
              { title: 'Files', value: payload.summary.files, href: '/memory' },
            ].map(item => (
              <Card key={item.title} style={{ padding: 18 }}>
                <div style={{ display: 'grid', gap: 8 }}>
                  <strong>{item.title}</strong>
                  <span style={{ fontSize: 28 }}>{item.value}</span>
                  <Link href={item.href} style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Open</Link>
                </div>
              </Card>
            ))}
          </Grid>
        </HomeSection>

        <HomeSection title="Privacy">
          <Grid>
            {Object.entries(payload.summary.visibility).map(([resource, counts]) => (
              <Card key={resource} style={{ padding: 18 }}>
                <div style={{ display: 'grid', gap: 10 }}>
                  <strong style={{ textTransform: 'capitalize' }}>{resource}</strong>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {Object.entries(counts).map(([visibility, count]) => (
                      <Badge key={`${resource}-${visibility}`} tone={ToneForVisibility(visibility)}>{visibility}: {count}</Badge>
                    ))}
                  </div>
                </div>
              </Card>
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

        <HomeSection title="Subagents" actionHref="/agents" actionLabel="Open Agents">
          {payload.subagents.length > 0 ? (
            <Grid>
              {payload.subagents.map(item => (
                <Card key={item.id} style={{ padding: 18 }}>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <strong>{item.name}</strong>
                      <Badge tone={ToneForVisibility(item.visibility)}>{item.visibility}</Badge>
                    </div>
                    <span style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>{item.description ?? 'Private specialist'}</span>
                  </div>
                </Card>
              ))}
            </Grid>
          ) : (
            <EmptyState title="No subagents yet" body="Create focused subagents for research, runtime work, and workflow tasks." action={<Button href="/agents">Open agents</Button>} />
          )}
        </HomeSection>

        <HomeSection title="Memory and Files" actionHref="/memory" actionLabel="Open Memory">
          <Grid>
            <Card style={{ padding: 18 }}>
              <div style={{ display: 'grid', gap: 10 }}>
                <strong>Memory</strong>
                {payload.memoryEntries.length > 0 ? payload.memoryEntries.map(item => (
                  <div key={item.id} style={{ display: 'grid', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <span>{item.key}</span>
                      <Badge tone={ToneForVisibility(item.visibility)}>{item.visibility}</Badge>
                    </div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{item.namespaceType}</span>
                  </div>
                )) : <span style={{ color: 'var(--text-secondary)' }}>No governed memory yet.</span>}
              </div>
            </Card>
            <Card style={{ padding: 18 }}>
              <div style={{ display: 'grid', gap: 10 }}>
                <strong>Files</strong>
                {payload.files.length > 0 ? payload.files.map(item => (
                  <div key={item.id} style={{ display: 'grid', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ wordBreak: 'break-word' }}>{item.path}</span>
                      <Badge tone={ToneForVisibility(item.visibility)}>{item.visibility}</Badge>
                    </div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{String(item.metadata.kind ?? 'file')}</span>
                  </div>
                )) : <span style={{ color: 'var(--text-secondary)' }}>No governed files yet.</span>}
              </div>
            </Card>
          </Grid>
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
            {payload.summary.recentActions.length > 0 ? payload.summary.recentActions.map(item => (
              <Card key={item.id} style={{ padding: 18 }}>
                <div style={{ display: 'grid', gap: 8 }}>
                  <strong>{item.type}</strong>
                  <span style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>{item.summary}</span>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>{formatDate(item.createdAt)}</span>
                </div>
              </Card>
            )) : [
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
