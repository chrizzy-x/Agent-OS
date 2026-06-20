'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { destroyBrowserSession, fetchBrowserSessionState, fetchWithBrowserSession, type BrowserSession } from '@/src/auth/browser-session';

type WorkspaceRef = { id: string; name: string; slug: string; plan: string };
type SessionRef = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  title: string;
  status: string;
  pinnedAt: string | null;
  archivedAt: string | null;
  updatedAt: string;
};
type ProjectRef = {
  id: string;
  workspaceId: string;
  name: string;
  status: string;
  pinned: boolean;
  updatedAt: string;
};
type ShellPayload = {
  workspaces: WorkspaceRef[];
  sessions: SessionRef[];
  projects: ProjectRef[];
  notifications: { unread: number };
  agents: { connected: number };
};

type ApplicationShellContextValue = {
  session: BrowserSession | null;
  activeWorkspaceId: string | null;
  activeProjectId: string | null;
  activeSessionId: string | null;
  setActiveWorkspace: (workspaceId: string) => void;
  setActiveProject: (projectId: string | null) => void;
  setActiveSession: (sessionId: string | null) => void;
  syncContext: (context: { workspaceId?: string | null; projectId?: string | null; sessionId?: string | null }) => void;
  refreshShell: () => Promise<void>;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  setLeftCollapsed: (value: boolean) => void;
  setRightCollapsed: (value: boolean) => void;
};

const ApplicationShellContext = createContext<ApplicationShellContextValue>({
  session: null,
  activeWorkspaceId: null,
  activeProjectId: null,
  activeSessionId: null,
  setActiveWorkspace: () => undefined,
  setActiveProject: () => undefined,
  setActiveSession: () => undefined,
  syncContext: () => undefined,
  refreshShell: async () => undefined,
  leftCollapsed: false,
  rightCollapsed: false,
  setLeftCollapsed: () => undefined,
  setRightCollapsed: () => undefined,
});
let shellInstanceCounter = 0;
const EXCLUDED_PREFIXES = ['/signin', '/signup', '/login', '/forgot-password', '/onboarding'];
const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: 'H' },
  { href: '/studio', label: 'Studio', icon: 'S' },
  { href: '/projects', label: 'Projects', icon: 'P' },
  { href: '/library', label: 'Library', icon: 'L' },
  { href: '/skills', label: 'Skills', icon: 'K' },
  { href: '/appstore', label: 'App Store', icon: 'A' },
  { href: '/subagents', label: 'Subagents', icon: 'G', aliases: ['/agents'] },
  { href: '/mcp', label: 'Universal MCP', icon: 'U', aliases: ['/connectors'] },
  { href: '/vault', label: 'Vault', icon: 'V' },
  { href: '/community', label: 'Community', icon: 'C' },
  { href: '/docs', label: 'Docs', icon: 'D' },
  { href: '/ffp', label: 'FFP', icon: 'F', disabled: true },
  { href: '/settings', label: 'Settings', icon: 'T', aliases: ['/profile', '/billing'] },
] as const;

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in hardened browsers.
  }
}

function beginNavigationMetric() {
  try {
    performance.clearMarks('agentos-navigation-start');
    performance.mark('agentos-navigation-start');
  } catch {
    // Performance marks are optional.
  }
}

function isActive(pathname: string, item: (typeof NAV_ITEMS)[number]) {
  if (item.href === '/') return pathname === '/';
  return pathname === item.href
    || pathname.startsWith(`${item.href}/`)
    || ('aliases' in item && item.aliases.some(alias => pathname === alias || pathname.startsWith(`${alias}/`)));
}

function initials(session: BrowserSession | null) {
  return (session?.agentName || 'User')
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('') || 'U';
}

function formatMode(value: string | null) {
  if (value === 'workflow') return 'Workflow Studio';
  if (value === 'code') return 'Code Studio';
  return 'NL Studio';
}

function tabletDefaultCollapsed() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(min-width: 768px) and (max-width: 1279px)').matches;
}

function DefaultRightPanel(props: {
  workspace: WorkspaceRef | null;
  project: ProjectRef | null;
  session: SessionRef | null;
  payload: ShellPayload;
}) {
  return (
    <div className="agentos-global-context">
      <section>
        <h2>Context</h2>
        <div><span>Workspace</span><strong>{props.workspace?.name ?? 'None'}</strong></div>
        <div><span>Project</span><strong>{props.project?.name ?? 'None'}</strong></div>
        <div><span>Session</span><strong>{props.session?.title ?? 'None'}</strong></div>
      </section>
      <section>
        <h2>Status</h2>
        <div><span>Unread</span><strong>{props.payload.notifications.unread}</strong></div>
        <div><span>External agents</span><strong>{props.payload.agents.connected}</strong></div>
        <div><span>FFP</span><strong>Coming Soon</strong></div>
      </section>
      <div id="agentos-right-panel-slot" />
    </div>
  );
}

function LeftSidebar(props: {
  payload: ShellPayload;
  pathname: string;
  activeWorkspaceId: string | null;
  activeProjectId: string | null;
  activeSessionId: string | null;
  collapsed: boolean;
  onWorkspace: (id: string) => void;
  onProject: (id: string) => void;
  onSession: (id: string) => void;
  onSessionAction: (session: SessionRef, action: 'rename' | 'pin' | 'archive' | 'delete' | 'continue') => void;
  onCloseMobile: () => void;
}) {
  const router = useRouter();
  const workspaceProjects = props.payload.projects.filter(item => item.workspaceId === props.activeWorkspaceId);
  const workspaceSessions = props.payload.sessions.filter(item => item.workspaceId === props.activeWorkspaceId);
  const pinnedSessions = workspaceSessions.filter(item => item.pinnedAt && !item.archivedAt);
  const recentSessions = workspaceSessions.filter(item => !item.pinnedAt && !item.archivedAt).slice(0, 8);
  const archivedSessions = workspaceSessions.filter(item => item.archivedAt).slice(0, 5);
  const pinnedProjects = workspaceProjects.filter(item => item.pinned);
  const recentProjects = workspaceProjects.filter(item => !item.pinned).slice(0, 5);

  function navigate(href: string) {
    props.onCloseMobile();
    beginNavigationMetric();
    router.push(href);
  }

  return (
    <div className="agentos-global-sidebar" data-collapsed={props.collapsed ? 'true' : 'false'}>
      <section className="agentos-global-workspace">
        <label htmlFor="agentos-workspace-select">Workspace</label>
        <select
          id="agentos-workspace-select"
          value={props.activeWorkspaceId ?? ''}
          onChange={event => props.onWorkspace(event.target.value)}
          aria-label="Current workspace"
        >
          {props.payload.workspaces.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </section>

      <nav className="agentos-global-nav" aria-label="AgentOS modules">
        {NAV_ITEMS.map(item => 'disabled' in item && item.disabled ? (
          <span key={item.href} className="disabled" aria-disabled="true" title="Coming Soon">
            <i aria-hidden="true">{item.icon}</i><b>{item.label}</b><small>Soon</small>
          </span>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            className={isActive(props.pathname, item) ? 'active' : ''}
            onClick={() => {
              beginNavigationMetric();
              props.onCloseMobile();
            }}
          >
            <i aria-hidden="true">{item.icon}</i><b>{item.label}</b>
          </Link>
        ))}
      </nav>

      <section className="agentos-global-quick">
        <h2>Quick Actions</h2>
        <button type="button" onClick={() => navigate('/studio?mode=nl')}>New Chat</button>
        <button type="button" onClick={() => navigate('/studio?mode=workflow&new=1')}>New Workflow</button>
        <button type="button" onClick={() => navigate('/projects?create=1')}>New Project</button>
        <button type="button" onClick={() => navigate('/subagents?create=1')}>New Subagent</button>
      </section>

      <section className="agentos-global-history">
        <h2>Chats</h2>
        {pinnedSessions.length > 0 ? <h3>Pinned Sessions</h3> : null}
        {pinnedSessions.map(item => (
          <div key={item.id} className="agentos-session-row">
            <button type="button" className={item.id === props.activeSessionId ? 'active' : ''} onClick={() => props.onSession(item.id)}>{item.title}</button>
            <button type="button" onClick={() => props.onSessionAction(item, 'rename')} aria-label={`Rename ${item.title}`}>R</button>
            <button type="button" onClick={() => props.onSessionAction(item, 'pin')} aria-label={`Unpin ${item.title}`}>U</button>
            <button type="button" onClick={() => props.onSessionAction(item, 'archive')} aria-label={`Archive ${item.title}`}>A</button>
          </div>
        ))}
        <h3>Recent Sessions</h3>
        {recentSessions.map(item => (
          <div key={item.id} className="agentos-session-row">
            <button type="button" className={item.id === props.activeSessionId ? 'active' : ''} onClick={() => props.onSession(item.id)}>{item.title}</button>
            <button type="button" onClick={() => props.onSessionAction(item, 'rename')} aria-label={`Rename ${item.title}`}>R</button>
            <button type="button" onClick={() => props.onSessionAction(item, 'pin')} aria-label={`Pin ${item.title}`}>P</button>
            <button type="button" onClick={() => props.onSessionAction(item, 'archive')} aria-label={`Archive ${item.title}`}>A</button>
          </div>
        ))}
        {archivedSessions.length > 0 ? <h3>Archived Sessions</h3> : null}
        {archivedSessions.map(item => (
          <div key={item.id} className="agentos-session-row">
            <button type="button" onClick={() => props.onSession(item.id)}>{item.title}</button>
            <button type="button" onClick={() => props.onSessionAction(item, 'continue')} aria-label={`Continue ${item.title}`}>C</button>
            <button type="button" onClick={() => props.onSessionAction(item, 'delete')} aria-label={`Delete ${item.title}`}>D</button>
          </div>
        ))}
      </section>

      <section className="agentos-global-history">
        <h2>Projects</h2>
        {pinnedProjects.length > 0 ? <h3>Pinned Projects</h3> : null}
        {pinnedProjects.map(item => (
          <button key={item.id} type="button" className={item.id === props.activeProjectId ? 'active' : ''} onClick={() => props.onProject(item.id)}>{item.name}</button>
        ))}
        <h3>Recent Projects</h3>
        {recentProjects.map(item => (
          <button key={item.id} type="button" className={item.id === props.activeProjectId ? 'active' : ''} onClick={() => props.onProject(item.id)}>{item.name}</button>
        ))}
      </section>
    </div>
  );
}

export default function ApplicationShell({ children }: { children: ReactNode }) {
  const shellInstanceRef = useRef<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const excluded = EXCLUDED_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [payload, setPayload] = useState<ShellPayload>({
    workspaces: [],
    sessions: [],
    projects: [],
    notifications: { unread: 0 },
    agents: { connected: 0 },
  });
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [leftCollapsed, setLeftCollapsedState] = useState(() => tabletDefaultCollapsed());
  const [rightCollapsed, setRightCollapsedState] = useState(() => tabletDefaultCollapsed());
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);

  if (!shellInstanceRef.current) {
    shellInstanceCounter += 1;
    shellInstanceRef.current = String(shellInstanceCounter);
  }

  const refreshShell = useCallback(async () => {
    const auth = await fetchBrowserSessionState().catch(() => ({ state: 'signed_out' as const, session: null }));
    setSession(auth.session);
    if (!auth.session) return;
    const response = await fetchWithBrowserSession('/api/shell/bootstrap', { cache: 'no-store' });
    if (!response.response.ok) return;
    const next = await response.response.json() as ShellPayload;
    setPayload(next);
    const storedWorkspace = readStored('agentos.shell.workspace');
    const workspaceId = next.workspaces.some(item => item.id === storedWorkspace) ? storedWorkspace : next.workspaces[0]?.id ?? null;
    setActiveWorkspaceId(workspaceId);
    if (!workspaceId) return;
    const storedProject = readStored(`agentos.shell.project.${workspaceId}`);
    const projectId = next.projects.some(item => item.workspaceId === workspaceId && item.id === storedProject)
      ? storedProject
      : next.projects.find(item => item.workspaceId === workspaceId)?.id ?? null;
    const storedSession = readStored(`agentos.shell.session.${workspaceId}`);
    const sessionId = next.sessions.some(item => item.workspaceId === workspaceId && item.id === storedSession)
      ? storedSession
      : null;
    setActiveProjectId(projectId);
    setActiveSessionId(sessionId);
  }, []);

  useEffect(() => {
    if (excluded) return;
    const tabletDefault = tabletDefaultCollapsed();
    const storedLeft = readStored('agentos.shell.leftCollapsed');
    const storedRight = readStored('agentos.shell.rightCollapsed');
    setLeftCollapsedState(storedLeft === null ? tabletDefault : storedLeft === 'true');
    setRightCollapsedState(storedRight === null ? tabletDefault : storedRight === 'true');
    void refreshShell();
  }, [excluded, refreshShell]);

  useEffect(() => {
    try {
      const start = performance.getEntriesByName('agentos-navigation-start').at(-1);
      if (!start) return;
      const duration = performance.now() - start.startTime;
      document.documentElement.dataset.agentosNavigationMs = duration.toFixed(2);
      performance.clearMarks('agentos-navigation-start');
    } catch {
      // Performance marks are optional.
    }
  }, [pathname]);

  useEffect(() => {
    function closeDrawers(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setLeftDrawerOpen(false);
      setRightDrawerOpen(false);
    }
    window.addEventListener('keydown', closeDrawers);
    return () => window.removeEventListener('keydown', closeDrawers);
  }, []);

  const setLeftCollapsed = useCallback((value: boolean) => {
    const startedAt = performance.now();
    setLeftCollapsedState(value);
    writeStored('agentos.shell.leftCollapsed', String(value));
    document.documentElement.dataset.agentosSidebarMs = (performance.now() - startedAt).toFixed(2);
  }, []);

  const setRightCollapsed = useCallback((value: boolean) => {
    const startedAt = performance.now();
    setRightCollapsedState(value);
    writeStored('agentos.shell.rightCollapsed', String(value));
    document.documentElement.dataset.agentosSidebarMs = (performance.now() - startedAt).toFixed(2);
  }, []);

  const setActiveWorkspace = useCallback((workspaceId: string) => {
    if (!payload.workspaces.some(item => item.id === workspaceId)) return;
    writeStored('agentos.shell.workspace', workspaceId);
    setActiveWorkspaceId(workspaceId);
    const storedProjectId = readStored(`agentos.shell.project.${workspaceId}`);
    const projectId = payload.projects.some(item => item.workspaceId === workspaceId && item.id === storedProjectId)
      ? storedProjectId
      : payload.projects.find(item => item.workspaceId === workspaceId)?.id ?? null;
    const sessionId = readStored(`agentos.shell.session.${workspaceId}`);
    setActiveProjectId(projectId);
    setActiveSessionId(payload.sessions.some(item => item.workspaceId === workspaceId && item.id === sessionId) ? sessionId : null);
    window.dispatchEvent(new CustomEvent('agentos:workspace-change', { detail: { workspaceId, projectId } }));
    const query = new URLSearchParams(searchParams.toString());
    query.set('workspace', workspaceId);
    if (projectId) query.set('project', projectId);
    else query.delete('project');
    query.delete('session');
    router.replace(`${pathname}?${query.toString()}`);
  }, [pathname, payload.projects, payload.sessions, payload.workspaces, router, searchParams]);

  const setActiveProject = useCallback((projectId: string | null) => {
    setActiveProjectId(projectId);
    if (activeWorkspaceId) writeStored(`agentos.shell.project.${activeWorkspaceId}`, projectId);
    if (pathname === '/studio' && projectId) {
      const query = new URLSearchParams(searchParams.toString());
      query.set('project', projectId);
      router.replace(`/studio?${query.toString()}`);
    } else if (projectId) {
      router.push(`/projects/${encodeURIComponent(projectId)}`);
    }
    setLeftDrawerOpen(false);
  }, [activeWorkspaceId, pathname, router, searchParams]);

  const setActiveSession = useCallback((sessionId: string | null) => {
    const target = payload.sessions.find(item => item.id === sessionId) ?? null;
    setActiveSessionId(sessionId);
    if (target) {
      setActiveWorkspaceId(target.workspaceId);
      setActiveProjectId(target.projectId);
      writeStored('agentos.shell.workspace', target.workspaceId);
      writeStored(`agentos.shell.session.${target.workspaceId}`, target.id);
      if (target.projectId) writeStored(`agentos.shell.project.${target.workspaceId}`, target.projectId);
      router.push(`/studio?mode=nl&session=${encodeURIComponent(target.id)}${target.projectId ? `&project=${encodeURIComponent(target.projectId)}` : ''}`);
    }
    setLeftDrawerOpen(false);
  }, [payload.sessions, router]);

  const manageSession = useCallback(async (target: SessionRef, action: 'rename' | 'pin' | 'archive' | 'delete' | 'continue') => {
    if (action === 'rename') {
      const title = window.prompt('Rename session', target.title)?.trim();
      if (!title) return;
      await fetchWithBrowserSession(`/api/studio/sessions/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
    } else if (action === 'pin') {
      await fetchWithBrowserSession(`/api/studio/sessions/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: !target.pinnedAt }),
      });
    } else if (action === 'continue') {
      await fetchWithBrowserSession(`/api/studio/sessions/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      });
      setActiveSession(target.id);
    } else {
      if (action === 'delete' && !window.confirm(`Delete ${target.title}?`)) return;
      await fetchWithBrowserSession(`/api/studio/sessions/${target.id}?mode=${action === 'delete' ? 'delete' : 'archive'}`, { method: 'DELETE' });
      if (target.id === activeSessionId) setActiveSessionId(null);
    }
    await refreshShell();
  }, [activeSessionId, refreshShell, setActiveSession]);

  const syncContext = useCallback((context: { workspaceId?: string | null; projectId?: string | null; sessionId?: string | null }) => {
    if (context.workspaceId !== undefined) {
      setActiveWorkspaceId(context.workspaceId);
      writeStored('agentos.shell.workspace', context.workspaceId);
    }
    const workspaceId = context.workspaceId ?? activeWorkspaceId;
    if (context.projectId !== undefined) {
      setActiveProjectId(context.projectId);
      if (workspaceId) writeStored(`agentos.shell.project.${workspaceId}`, context.projectId);
    }
    if (context.sessionId !== undefined) {
      setActiveSessionId(context.sessionId);
      if (workspaceId) writeStored(`agentos.shell.session.${workspaceId}`, context.sessionId);
    }
  }, [activeWorkspaceId]);

  const workspace = payload.workspaces.find(item => item.id === activeWorkspaceId) ?? null;
  const project = payload.projects.find(item => item.id === activeProjectId) ?? null;
  const activeSession = payload.sessions.find(item => item.id === activeSessionId) ?? null;
  const mode = searchParams.get('mode');

  const contextValue = useMemo<ApplicationShellContextValue>(() => ({
    session,
    activeWorkspaceId,
    activeProjectId,
    activeSessionId,
    setActiveWorkspace,
    setActiveProject,
    setActiveSession,
    syncContext,
    refreshShell,
    leftCollapsed,
    rightCollapsed,
    setLeftCollapsed,
    setRightCollapsed,
  }), [
    activeProjectId,
    activeSessionId,
    activeWorkspaceId,
    leftCollapsed,
    refreshShell,
    rightCollapsed,
    session,
    setActiveProject,
    setActiveSession,
    setActiveWorkspace,
    setLeftCollapsed,
    setRightCollapsed,
    syncContext,
  ]);

  if (excluded) return <>{children}</>;

  async function logout() {
    await destroyBrowserSession();
    router.replace('/signin');
  }

  return (
    <ApplicationShellContext.Provider value={contextValue}>
      <div
        className="agentos-global-shell"
        data-left-collapsed={leftCollapsed ? 'true' : 'false'}
        data-right-collapsed={rightCollapsed ? 'true' : 'false'}
        data-left-open={leftDrawerOpen ? 'true' : 'false'}
        data-right-open={rightDrawerOpen ? 'true' : 'false'}
        data-studio={pathname === '/studio' ? 'true' : 'false'}
        data-shell-instance={shellInstanceRef.current}
      >
        <header className="agentos-global-header">
          <button type="button" className="agentos-shell-mobile-button left" onClick={() => setLeftDrawerOpen(true)} aria-label="Open navigation">Menu</button>
          <Link href="/" className="agentos-global-brand" aria-label="AgentOS Home">
            <Image src="/logo.png" alt="" width={26} height={26} />
            <strong>AgentOS</strong>
          </Link>
          <div className="agentos-global-breadcrumbs" aria-label="Current operating context">
            <span>{workspace?.name ?? 'Workspace'}</span>
            <span>{project?.name ?? 'No project'}</span>
            <span>{activeSession?.title ?? 'No session'}</span>
            {pathname === '/studio' ? <span>{formatMode(mode)}</span> : null}
            {pathname === '/studio' ? <span>{process.env.NEXT_PUBLIC_AGENTOS_MODEL ?? 'Default model'}</span> : null}
          </div>
          <div className="agentos-global-header-actions">
            <Link href="/notifications" aria-label={`${payload.notifications.unread} unread notifications`}>Alerts {payload.notifications.unread}</Link>
            <Link href="/settings" className="agentos-global-user">
              <span>{initials(session)}</span>
              <b>{session?.agentName ?? 'Account'}</b>
            </Link>
            {session ? <button type="button" onClick={() => void logout()}>Logout</button> : <Link href="/signin">Sign in</Link>}
          </div>
          <button type="button" className="agentos-shell-mobile-button right" onClick={() => setRightDrawerOpen(true)} aria-label="Open context">Context</button>
        </header>

        <aside className="agentos-global-left" aria-label="Navigation sidebar">
          <button type="button" className="agentos-shell-drawer-close" onClick={() => setLeftDrawerOpen(false)} aria-label="Close navigation">Close</button>
          <button type="button" className="agentos-shell-collapse" onClick={() => setLeftCollapsed(!leftCollapsed)} aria-label={leftCollapsed ? 'Expand navigation sidebar' : 'Collapse navigation sidebar'}>
            {leftCollapsed ? '›' : '‹'}
          </button>
          <LeftSidebar
            payload={payload}
            pathname={pathname}
            activeWorkspaceId={activeWorkspaceId}
            activeProjectId={activeProjectId}
            activeSessionId={activeSessionId}
            collapsed={leftCollapsed}
            onWorkspace={setActiveWorkspace}
            onProject={setActiveProject}
            onSession={setActiveSession}
            onSessionAction={(target, action) => void manageSession(target, action)}
            onCloseMobile={() => setLeftDrawerOpen(false)}
          />
        </aside>

        <main className="agentos-global-main">{children}</main>

        <aside className="agentos-global-right" aria-label="Context sidebar">
          <button type="button" className="agentos-shell-drawer-close" onClick={() => setRightDrawerOpen(false)} aria-label="Close context">Close</button>
          <button type="button" className="agentos-shell-collapse" onClick={() => setRightCollapsed(!rightCollapsed)} aria-label={rightCollapsed ? 'Expand context sidebar' : 'Collapse context sidebar'}>
            {rightCollapsed ? '‹' : '›'}
          </button>
          <DefaultRightPanel workspace={workspace} project={project} session={activeSession} payload={payload} />
        </aside>

        {(leftDrawerOpen || rightDrawerOpen) ? (
          <button
            type="button"
            className="agentos-shell-backdrop"
            onClick={() => {
              setLeftDrawerOpen(false);
              setRightDrawerOpen(false);
            }}
            aria-label="Close drawer"
          />
        ) : null}
      </div>
    </ApplicationShellContext.Provider>
  );
}

export function useApplicationShell() {
  return useContext(ApplicationShellContext);
}
