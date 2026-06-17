'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import { AppShell, Badge } from '@/components/os/ui';

type WorkspaceRef = {
  id: string;
  name: string;
  plan?: string;
};

type SessionRef = {
  id: string;
  workspaceId: string;
  title: string;
  updatedAt: string;
  status?: string;
  branchLabel?: string | null;
};

type ContextSummary = {
  activeSessions?: number;
  subagents?: number;
  memoryEntries?: number;
  installedSkills?: number;
  connectedApps?: number;
  privateWorkflows?: number;
};

type WorkspaceShellProps = {
  activePath: string;
  children: ReactNode;
  aside?: ReactNode;
  session?: BrowserSession | null;
  workspaces?: WorkspaceRef[];
  sessions?: SessionRef[];
  currentWorkspaceId?: string | null;
  currentSessionId?: string | null;
  extraSidebar?: ReactNode;
  mobileTitle?: string;
};

const NAV_GROUPS: Array<Array<{ href: string; label: string; icon: string; aliases?: string[] }>> = [
  [
    { href: '/studio?mode=nl', label: 'New Chat', icon: '+', aliases: ['/'] },
    { href: '/studio?mode=nl', label: 'Chats', icon: 'S', aliases: ['/studio'] },
  ],
  [
    { href: '/projects', label: 'Projects', icon: 'P' },
    { href: '/library', label: 'Library', icon: 'L' },
  ],
  [
    { href: '/apps', label: 'Apps', icon: 'A' },
    { href: '/skills/installed', label: 'Skills', icon: 'K' },
    { href: '/workflows', label: 'Workflows', icon: 'W' },
    { href: '/subagents', label: 'Subagents', icon: 'G', aliases: ['/agents'] },
  ],
  [
    { href: '/appstore', label: 'App Store', icon: 'O' },
    { href: '/skills', label: 'Skill Store', icon: 'T' },
  ],
  [
    { href: '/memory', label: 'Memory', icon: 'M' },
    { href: '/vault', label: 'Vault', icon: 'V' },
    { href: '/mcp', label: 'Universal MCP', icon: 'U', aliases: ['/connectors'] },
    { href: '/ffp', label: 'FFP (temp)', icon: 'F' },
  ],
  [
    { href: '/developer', label: 'Developer', icon: 'D' },
  ],
  [
    { href: '/profile', label: 'Profile', icon: 'I', aliases: ['/settings'] },
  ],
];

function isActive(activePath: string, href: string, aliases: string[] = []) {
  const base = href.split('?')[0];
  return activePath === base || aliases.includes(activePath);
}

export default function WorkspaceShell(props: WorkspaceShellProps) {
  const [session, setSession] = useState<BrowserSession | null>(props.session ?? null);
  const [workspaces, setWorkspaces] = useState<WorkspaceRef[]>(props.workspaces ?? []);
  const [sessions, setSessions] = useState<SessionRef[]>(props.sessions ?? []);
  const [summary, setSummary] = useState<ContextSummary>({});

  useEffect(() => {
    if (props.session !== undefined) {
      setSession(props.session);
      return;
    }
    let active = true;
    void fetchBrowserSession()
      .then(current => {
        if (active) setSession(current);
      })
      .catch(() => {
        if (active) setSession(null);
      });
    return () => {
      active = false;
    };
  }, [props.session]);

  useEffect(() => {
    if (props.workspaces !== undefined) {
      setWorkspaces(props.workspaces);
      return;
    }
    if (!session) {
      setWorkspaces([]);
      return;
    }
    let active = true;
    void fetch('/api/workspaces', { cache: 'no-store' })
      .then(response => response.json())
      .then(payload => {
        if (active) setWorkspaces(payload.workspaces ?? []);
      })
      .catch(() => {
        if (active) setWorkspaces([]);
      });
    return () => {
      active = false;
    };
  }, [props.workspaces, session]);

  useEffect(() => {
    if (props.sessions !== undefined) {
      setSessions(props.sessions);
      return;
    }
    if (!session) {
      setSessions([]);
      return;
    }
    let active = true;
    void fetch('/api/studio/sessions', { cache: 'no-store' })
      .then(response => response.json())
      .then(payload => {
        if (active) setSessions(payload.sessions ?? []);
      })
      .catch(() => {
        if (active) setSessions([]);
      });
    return () => {
      active = false;
    };
  }, [props.sessions, session]);

  useEffect(() => {
    if (!session) {
      setSummary({});
      return;
    }
    let active = true;
    void fetch('/api/super-agent', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : {})
      .then((payload: { summary?: ContextSummary }) => {
        if (active) setSummary(payload.summary ?? {});
      })
      .catch(() => {
        if (active) setSummary({});
      });
    return () => {
      active = false;
    };
  }, [session]);

  const currentWorkspaceId = props.currentWorkspaceId ?? workspaces[0]?.id ?? null;
  const currentWorkspace = workspaces.find(item => item.id === currentWorkspaceId) ?? workspaces[0] ?? null;
  const recentSessions = useMemo(
    () => sessions
      .filter(item => !currentWorkspaceId || item.workspaceId === currentWorkspaceId)
      .slice(0, 5),
    [currentWorkspaceId, sessions],
  );

  const rail = (
    <div className="agentos-sidebar">
      <Link href="/studio" className="agentos-sidebar-brand">Super AgentOS</Link>
      <nav className="agentos-sidebar-nav" aria-label="AgentOS navigation">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={`group-${groupIndex}`} className="agentos-sidebar-group">
            {group.map(item => (
              <Link
                key={`${item.href}-${item.label}`}
                href={item.href}
                className={isActive(props.activePath, item.href, item.aliases) ? 'active' : ''}
              >
                <span className="agentos-sidebar-icon" aria-hidden="true">{item.icon}</span>
                <span>{item.label === 'FFP (temp)' ? <>FFP <small><em>(temp)</em></small></> : item.label}</span>
              </Link>
            ))}
          </div>
        ))}
      </nav>
      {props.extraSidebar}
      <div className="agentos-sidebar-bottom">
        <button type="button" className="agentos-health">Healthy</button>
      </div>
    </div>
  );

  const context = (
    <div className="agentos-context-panel">
      <div className="agentos-context-title">Context</div>
      <div className="agentos-context-rows">
        <div><span>Apps</span><strong>{summary.connectedApps ?? 0}</strong></div>
        <div><span>Skills</span><strong>{summary.installedSkills ?? 0}</strong></div>
        <div><span>Workflows</span><strong>{summary.privateWorkflows ?? 0}</strong></div>
        <div><span>Subagents</span><strong>{summary.subagents ?? 0}</strong></div>
        <div><span>Memory</span><strong>{summary.memoryEntries ? 'Active' : 'Idle'}</strong></div>
        <div><span>Vault</span><strong>Secure</strong></div>
        <div><span>MCP</span><strong>{session?.capabilities?.includes('mcp') ? '8' : 'Ready'}</strong></div>
        <div><span>FFP</span><strong>{session?.capabilities?.includes('ffp') ? 'Healthy' : 'Visible'}</strong></div>
      </div>
      <div className="agentos-context-title">Active</div>
      <div className="agentos-context-rows">
        <div><span>Current Project</span><strong>{currentWorkspace?.name ?? 'Default'}</strong></div>
        <div><span>Current Workflow</span><strong>None</strong></div>
        <div><span>Current App</span><strong>None</strong></div>
        <div><span>Current Skill</span><strong>None</strong></div>
        <div><span>Running Tasks</span><strong>{summary.activeSessions ?? 0}</strong></div>
      </div>
      {recentSessions.length > 0 ? (
        <>
          <div className="agentos-context-title">Recent Chats</div>
          <div className="agentos-context-list">
            {recentSessions.map(item => (
              <Link key={item.id} href={`/studio?session=${encodeURIComponent(item.id)}`}>
                <span>{item.title}</span>
                <Badge tone="default">{item.branchLabel || item.status || 'chat'}</Badge>
              </Link>
            ))}
          </div>
        </>
      ) : null}
      {props.aside ? <div className="agentos-context-extra">{props.aside}</div> : null}
    </div>
  );

  return (
    <AppShell className="os-workspace-shell" sidebar={rail} aside={context}>
      {props.children}
    </AppShell>
  );
}
