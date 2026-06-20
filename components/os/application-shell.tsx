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
import {
  destroyBrowserSession,
  fetchBrowserSessionState,
  fetchWithBrowserSession,
  type BrowserSession,
} from '@/src/auth/browser-session';

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
  { href: '/workflows', label: 'Workflows', icon: 'W' },
  { href: '/library', label: 'Library', icon: 'L' },
  { href: '/appstore', label: 'App Store', icon: 'A' },
  { href: '/developer', label: 'Developer', icon: 'D' },
  { href: '/ffp', label: 'FFP', icon: 'F' },
  { href: '/settings', label: 'Settings', icon: 'T' },
] as const;
const MOBILE_NAV_ITEMS = NAV_ITEMS.filter(item => ['Home', 'Studio', 'Library', 'Workflows', 'Settings'].includes(item.label));
const WORKSPACE_LABELS = ['Personal Workspace', 'AgentOS Workspace', 'deZypher Workspace', 'Derek Workspace'];
const NEW_WORKSPACE_VALUE = '__new_workspace__';

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

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
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

function workspaceOptions(workspaces: WorkspaceRef[]) {
  const byName = new Map(workspaces.map(item => [item.name.toLowerCase(), item]));
  const listed = new Set<string>();
  const options = WORKSPACE_LABELS.map(label => {
    const match = byName.get(label.toLowerCase()) ?? workspaces.find(item => item.name.toLowerCase().includes(label.replace(' Workspace', '').toLowerCase()));
    if (match) listed.add(match.id);
    return { label, id: match?.id ?? null };
  });
  for (const workspace of workspaces) {
    if (!listed.has(workspace.id)) options.push({ label: workspace.name, id: workspace.id });
  }
  return options;
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
        <h2>Hierarchy</h2>
        <div><span>Projects</span><strong>Context</strong></div>
        <div><span>Assets</span><strong>Capability</strong></div>
        <div><span>Workflows</span><strong>Execution</strong></div>
      </section>
      <section>
        <h2>Status</h2>
        <div><span>Unread</span><strong>{props.payload.notifications.unread}</strong></div>
        <div><span>Subagents</span><strong>{props.payload.agents.connected}</strong></div>
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
  collapsed: boolean;
  onWorkspace: (id: string) => void;
  onCreateWorkspace: () => void;
  onCloseMobile: () => void;
}) {
  return (
    <div className="agentos-global-sidebar" data-collapsed={props.collapsed ? 'true' : 'false'}>
      <section className="agentos-global-workspace">
        <label htmlFor="agentos-workspace-select">Workspace</label>
        <select
          id="agentos-workspace-select"
          value={props.activeWorkspaceId ?? ''}
          onChange={event => {
            if (event.target.value === NEW_WORKSPACE_VALUE) props.onCreateWorkspace();
            else props.onWorkspace(event.target.value);
          }}
          aria-label="Current workspace"
        >
          {workspaceOptions(props.payload.workspaces).map(item => (
            <option key={item.label} value={item.id ?? item.label} disabled={!item.id}>
              {item.label}
            </option>
          ))}
          <option value={NEW_WORKSPACE_VALUE}>+ New Workspace</option>
        </select>
      </section>

      <nav className="agentos-global-nav" aria-label="AgentOS modules">
        {NAV_ITEMS.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={isActive(props.pathname, item.href) ? 'active' : ''}
            onClick={() => {
              beginNavigationMetric();
              props.onCloseMobile();
            }}
          >
            <i aria-hidden="true">{item.icon}</i><b>{item.label}</b>
          </Link>
        ))}
      </nav>
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

  const createWorkspace = useCallback(async () => {
    const name = window.prompt('Workspace name', 'New Workspace')?.trim();
    if (!name) return;
    const result = await fetchWithBrowserSession('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!result.response.ok) return;
    const body = await result.response.json().catch(() => ({})) as { workspace?: WorkspaceRef };
    if (body.workspace?.id) {
      writeStored('agentos.shell.workspace', body.workspace.id);
      setActiveWorkspaceId(body.workspace.id);
      setActiveProjectId(null);
      setActiveSessionId(null);
      window.dispatchEvent(new CustomEvent('agentos:workspace-change', { detail: { workspaceId: body.workspace.id, projectId: null } }));
    }
    await refreshShell();
  }, [refreshShell]);

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
          </div>
          <div className="agentos-global-header-actions">
            <Link href="/search">Search</Link>
            <Link href="/settings?sessions=1" aria-label={`${payload.notifications.unread} unread notifications`}>Alerts {payload.notifications.unread}</Link>
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
            {leftCollapsed ? '>' : '<'}
          </button>
          <LeftSidebar
            payload={payload}
            pathname={pathname}
            activeWorkspaceId={activeWorkspaceId}
            collapsed={leftCollapsed}
            onWorkspace={setActiveWorkspace}
            onCreateWorkspace={() => void createWorkspace()}
            onCloseMobile={() => setLeftDrawerOpen(false)}
          />
        </aside>

        <main className="agentos-global-main">{children}</main>

        <aside className="agentos-global-right" aria-label="Context sidebar">
          <button type="button" className="agentos-shell-drawer-close" onClick={() => setRightDrawerOpen(false)} aria-label="Close context">Close</button>
          <button type="button" className="agentos-shell-collapse" onClick={() => setRightCollapsed(!rightCollapsed)} aria-label={rightCollapsed ? 'Expand context sidebar' : 'Collapse context sidebar'}>
            {rightCollapsed ? '<' : '>'}
          </button>
          <DefaultRightPanel workspace={workspace} project={project} session={activeSession} payload={payload} />
        </aside>

        <nav className="agentos-mobile-primary-nav" aria-label="Mobile primary navigation">
          {MOBILE_NAV_ITEMS.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={isActive(pathname, item.href) ? 'active' : ''}
              onClick={beginNavigationMetric}
            >
              <i aria-hidden="true">{item.icon}</i>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

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
