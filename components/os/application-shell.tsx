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
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { destroyBrowserSession, fetchBrowserSessionState, fetchWithBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import { appendShellContextToHref, type ShellNavigationContext } from '@/src/product/shell-routing';
import { NAVIGATION_SURFACES, isProductSurfaceActivePath, pageTitleForProductPath, primaryActionForProductPath } from '@/src/product/surfaces';

type WorkspaceRef = { id: string; name: string; slug: string; plan: string };
type SessionRef = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  title: string;
  status: string;
  visibility?: 'private' | 'workspace' | 'public';
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
type NotificationRef = {
  id: string;
  type: string;
  title: string;
  body: string;
  status: 'unread' | 'read' | 'archived';
  metadata: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
  workspaceId?: string | null;
  sessionId?: string | null;
  executionId?: string | null;
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
const SHELL_INSTANCE_ID = 'agentos-global-shell-root';
const EXCLUDED_PREFIXES = ['/signin', '/signup', '/login', '/forgot-password'];

const ACCOUNT_MENU_LINKS = [
  { label: 'Profile', href: '/settings?section=account' },
  { label: 'Account', href: '/settings?section=account' },
  { label: 'Subscription & Billing', href: '/settings?section=billing' },
  { label: 'Appearance', href: '/settings?section=appearance' },
  { label: 'Notifications', href: '/settings?section=notifications' },
  { label: 'Resources', href: '/resources' },
  { label: 'Download Desktop', href: '/settings?section=general#downloads' },
  { label: 'Download Mobile', href: '/settings?section=general#downloads' },
  { label: 'Switch Workspace', href: '/settings?section=general#workspaces' },
  { label: 'Switch Organization', href: '/settings?section=general#organizations' },
  { label: 'Create Workspace', href: '/settings?section=general#workspaces' },
] as const;

const NOTIFICATION_GROUPS = [
  'Unread',
  'Recent',
  'System',
  'Workflow',
  'Billing',
  'Security',
  'Community',
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

function initials(session: BrowserSession | null) {
  return (session?.agentName || 'User')
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('') || 'U';
}

function formatMode(value: string | null) {
  if (value === 'workflow') return 'Workflow Builder';
  if (value === 'code') return 'Code Studio';
  return 'NL Studio';
}

function badgeCount(value: number): string {
  if (value <= 0) return '';
  return value > 99 ? '99+' : String(value);
}

function notificationHref(item: NotificationRef): string {
  const deepLink = item.metadata.deepLink ?? item.metadata.href ?? item.metadata.navigateTo ?? item.metadata.actionHref;
  if (typeof deepLink === 'string' && deepLink.startsWith('/')) return deepLink;
  if (item.sessionId) return `/studio?mode=nl&session=${encodeURIComponent(item.sessionId)}`;
  if (item.executionId) return `/studio?mode=nl&execution=${encodeURIComponent(item.executionId)}`;
  return '/settings#notifications';
}

function notificationGroup(type: string): typeof NOTIFICATION_GROUPS[number] {
  const normalized = type.toLowerCase();
  if (normalized.includes('workflow') || normalized.includes('execution') || normalized.includes('studio')) return 'Workflow';
  if (normalized.includes('billing') || normalized.includes('payment') || normalized.includes('subscription')) return 'Billing';
  if (normalized.includes('security') || normalized.includes('auth') || normalized.includes('token') || normalized.includes('session')) return 'Security';
  if (normalized.includes('community') || normalized.includes('follow') || normalized.includes('review')) return 'Community';
  return 'System';
}

function formatNotificationTime(value: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  } catch {
    return 'Recent';
  }
}

function formatSessionTime(value: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value));
  } catch {
    return 'Recent';
  }
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

function NotificationDrawer(props: {
  open: boolean;
  notifications: NotificationRef[];
  loading: boolean;
  unread: number;
  onClose: () => void;
  onOpen: (item: NotificationRef) => void;
  onMark: (item: NotificationRef, status: NotificationRef['status']) => void;
  onMarkAllRead: () => void;
}) {
  if (!props.open) return null;
  const grouped = new Map<typeof NOTIFICATION_GROUPS[number], NotificationRef[]>();
  for (const group of NOTIFICATION_GROUPS) grouped.set(group, []);
  for (const item of props.notifications) {
    if (item.status === 'archived') continue;
    if (item.status === 'unread') grouped.get('Unread')?.push(item);
    grouped.get('Recent')?.push(item);
    grouped.get(notificationGroup(item.type))?.push(item);
  }

  return (
    <aside className="agentos-notification-drawer" aria-label="Notification drawer">
      <div className="agentos-notification-head">
        <div>
          <span>Notifications</span>
          <strong>{props.unread} unread</strong>
        </div>
        <div className="agentos-notification-head-actions">
          <button type="button" onClick={props.onMarkAllRead} disabled={props.unread === 0}>Mark All Read</button>
          <button type="button" onClick={props.onClose} aria-label="Close notifications">Close</button>
        </div>
      </div>
      <div className="agentos-notification-body">
        {props.loading ? <div className="agentos-notification-empty">Loading notifications</div> : null}
        {!props.loading && props.notifications.filter(item => item.status !== 'archived').length === 0 ? (
          <div className="agentos-notification-empty">No notifications</div>
        ) : null}
        {NOTIFICATION_GROUPS.map(group => {
          const items = (grouped.get(group) ?? []).slice(0, group === 'Recent' ? 8 : 6);
          return (
            <section key={group} className="agentos-notification-group">
              <h2>{group}</h2>
              {items.length === 0 ? <span className="agentos-notification-muted">None</span> : items.map(item => (
                <article key={`${group}-${item.id}`} className="agentos-notification-item" data-status={item.status}>
                  <i aria-hidden="true">{notificationGroup(item.type).slice(0, 1)}</i>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.body}</p>
                    <time>{formatNotificationTime(item.createdAt)}</time>
                    <div className="agentos-notification-actions">
                      <button type="button" onClick={() => props.onOpen(item)}>Open</button>
                      {item.status !== 'read' ? <button type="button" onClick={() => props.onMark(item, 'read')}>Mark Read</button> : null}
                      <button type="button" onClick={() => props.onMark(item, 'archived')}>Dismiss</button>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          );
        })}
      </div>
    </aside>
  );
}

function LeftSidebar(props: {
  payload: ShellPayload;
  pathname: string;
  activeWorkspaceId: string | null;
  activeProjectId: string | null;
  activeSessionId: string | null;
  navigationContext: ShellNavigationContext;
  collapsed: boolean;
  onWorkspace: (id: string) => void;
  onProject: (id: string) => void;
  onSession: (id: string) => void;
  onSessionAction: (session: SessionRef, action: 'rename' | 'pin' | 'archive' | 'delete' | 'continue' | 'attach', projectId?: string) => void;
  onCloseMobile: () => void;
}) {
  const router = useRouter();
  const [attachSessionId, setAttachSessionId] = useState<string | null>(null);
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
    router.push(appendShellContextToHref(href, props.navigationContext));
  }

  const projectName = (projectId: string | null) =>
    projectId ? workspaceProjects.find(project => project.id === projectId)?.name ?? 'Project attached' : 'No project';

  const renderSessionRow = (item: SessionRef, archived = false) => (
    <div key={item.id} className="agentos-session-row" data-managed="true">
      <button type="button" className={item.id === props.activeSessionId ? 'active' : ''} onClick={() => props.onSession(item.id)}>
        <span>{item.pinnedAt ? 'Pinned: ' : ''}{item.title}</span>
        <small>{projectName(item.projectId)} | {item.visibility ?? 'private'} | {formatSessionTime(item.updatedAt)}</small>
      </button>
      <div className="agentos-session-actions" aria-label={`${item.title} session actions`}>
        {archived ? (
          <>
            <button type="button" onClick={() => props.onSessionAction(item, 'continue')} title="Continue this archived session">Continue</button>
            <button type="button" onClick={() => props.onSessionAction(item, 'delete')} title="Delete this session">Delete</button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => props.onSession(item.id)} title="Continue this session">Open</button>
            <button type="button" onClick={() => props.onSessionAction(item, 'rename')} title="Rename this session">Rename</button>
            <button type="button" onClick={() => props.onSessionAction(item, 'pin')} title={item.pinnedAt ? 'Unpin this session' : 'Pin this session'}>{item.pinnedAt ? 'Unpin' : 'Pin'}</button>
            <button
              type="button"
              onClick={() => setAttachSessionId(attachSessionId === item.id ? null : item.id)}
              title={workspaceProjects.length > 0 ? 'Attach this session to a project' : 'No projects are available to attach'}
            >
              Attach
            </button>
            <button type="button" onClick={() => props.onSessionAction(item, 'archive')} title="Archive this session">Archive</button>
            <button type="button" onClick={() => props.onSessionAction(item, 'delete')} title="Delete this session">Delete</button>
          </>
        )}
      </div>
      {attachSessionId === item.id && !archived ? (
        <div className="agentos-session-attach" role="menu" aria-label={`Attach ${item.title} to project`}>
          {workspaceProjects.length > 0 ? workspaceProjects.map(project => (
            <button
              key={project.id}
              type="button"
              onClick={() => {
                setAttachSessionId(null);
                props.onSessionAction(item, 'attach', project.id);
              }}
              disabled={item.projectId === project.id}
              title={item.projectId === project.id ? 'Already attached to this project' : `Attach to ${project.name}`}
            >
              {project.name}{item.projectId === project.id ? ' (current)' : ''}
            </button>
          )) : <span>No projects available.</span>}
        </div>
      ) : null}
    </div>
  );

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
        {NAVIGATION_SURFACES.map(item => (
          <Link
            key={item.href}
            href={appendShellContextToHref(item.href, props.navigationContext)}
            className={[
              isProductSurfaceActivePath(props.pathname, item) ? 'active' : '',
              item.status === 'coming_soon' ? 'coming-soon' : '',
            ].filter(Boolean).join(' ')}
            title={item.disabledReason}
            onClick={() => {
              beginNavigationMetric();
              props.onCloseMobile();
            }}
          >
            <i aria-hidden="true">{item.icon}</i><b>{item.label}</b>{item.status === 'coming_soon' ? <small>Soon</small> : null}
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
        {pinnedSessions.map(item => renderSessionRow(item))}
        <h3>Recent Sessions</h3>
        {recentSessions.map(item => renderSessionRow(item))}
        {archivedSessions.length > 0 ? <h3>Archived Sessions</h3> : null}
        {archivedSessions.map(item => renderSessionRow(item, true))}
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
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeStateKey = `${pathname}?${searchParams.toString()}`;
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
  const [leftCollapsed, setLeftCollapsedState] = useState(false);
  const [rightCollapsed, setRightCollapsedState] = useState(false);
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  const [notificationDrawerOpen, setNotificationDrawerOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRef[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [shellSearch, setShellSearch] = useState('');

  const refreshShell = useCallback(async () => {
    const auth = await fetchBrowserSessionState().catch(() => ({ state: 'signed_out' as const, session: null }));
    setSession(auth.session);
    if (!auth.session) return;
    const response = await fetchWithBrowserSession('/api/shell/bootstrap', { cache: 'no-store' });
    if (!response.response.ok) return;
    const next = await response.response.json() as ShellPayload;
    setPayload(next);
    const params = new URLSearchParams(window.location.search);
    const requestedWorkspace = params.get('workspace');
    const requestedProject = params.get('project');
    const requestedSession = params.get('session');
    const requestedSessionRef = next.sessions.find(item => item.id === requestedSession) ?? null;
    const storedWorkspace = readStored('agentos.shell.workspace');
    const workspaceId = requestedSessionRef?.workspaceId
      ?? (next.workspaces.some(item => item.id === requestedWorkspace) ? requestedWorkspace : null)
      ?? (next.workspaces.some(item => item.id === storedWorkspace) ? storedWorkspace : next.workspaces[0]?.id ?? null);
    writeStored('agentos.shell.workspace', workspaceId);
    setActiveWorkspaceId(workspaceId);
    if (!workspaceId) return;
    const storedProject = readStored(`agentos.shell.project.${workspaceId}`);
    const projectId = next.projects.some(item => item.workspaceId === workspaceId && item.id === requestedProject)
      ? requestedProject
      : requestedSessionRef?.projectId
        ?? (next.projects.some(item => item.workspaceId === workspaceId && item.id === storedProject)
          ? storedProject
          : next.projects.find(item => item.workspaceId === workspaceId)?.id ?? null);
    const storedSession = readStored(`agentos.shell.session.${workspaceId}`);
    const sessionId = requestedSessionRef?.workspaceId === workspaceId
      ? requestedSessionRef.id
      : next.sessions.some(item => item.workspaceId === workspaceId && item.id === storedSession)
        ? storedSession
        : null;
    writeStored(`agentos.shell.project.${workspaceId}`, projectId);
    writeStored(`agentos.shell.session.${workspaceId}`, sessionId);
    setActiveProjectId(projectId);
    setActiveSessionId(sessionId);
    window.dispatchEvent(new CustomEvent('agentos:workspace-change', { detail: { workspaceId, projectId, sessionId } }));
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
    setLeftDrawerOpen(false);
    setRightDrawerOpen(false);
    setNotificationDrawerOpen(false);
  }, [routeStateKey]);

  useEffect(() => {
    const drawerOpen = leftDrawerOpen || rightDrawerOpen || notificationDrawerOpen;
    document.body.setAttribute('data-agentos-drawer-open', drawerOpen ? 'true' : 'false');
    return () => {
      document.body.removeAttribute('data-agentos-drawer-open');
    };
  }, [leftDrawerOpen, notificationDrawerOpen, rightDrawerOpen]);

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
      setNotificationDrawerOpen(false);
    }
    window.addEventListener('keydown', closeDrawers);
    return () => window.removeEventListener('keydown', closeDrawers);
  }, []);

  const loadNotifications = useCallback(async () => {
    if (!session) return;
    setNotificationsLoading(true);
    try {
      const response = await fetchWithBrowserSession('/api/notifications?status=all&limit=100', { cache: 'no-store' });
      if (!response.response.ok) return;
      const data = await response.response.json() as { notifications?: NotificationRef[] };
      setNotifications(data.notifications ?? []);
      setPayload(current => ({
        ...current,
        notifications: { unread: (data.notifications ?? []).filter(item => item.status === 'unread').length },
      }));
    } finally {
      setNotificationsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!notificationDrawerOpen) return;
    void loadNotifications();
  }, [loadNotifications, notificationDrawerOpen]);

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
      router.push(`/studio?mode=nl&workspace=${encodeURIComponent(target.workspaceId)}&session=${encodeURIComponent(target.id)}${target.projectId ? `&project=${encodeURIComponent(target.projectId)}` : ''}`);
    }
    setLeftDrawerOpen(false);
  }, [payload.sessions, router]);

  const manageSession = useCallback(async (target: SessionRef, action: 'rename' | 'pin' | 'archive' | 'delete' | 'continue' | 'attach', projectId?: string) => {
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
    } else if (action === 'attach') {
      if (!projectId) return;
      await fetchWithBrowserSession(`/api/studio/sessions/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      if (target.id === activeSessionId) {
        setActiveProjectId(projectId);
        writeStored(`agentos.shell.project.${target.workspaceId}`, projectId);
        if (pathname === '/studio') {
          const query = new URLSearchParams(searchParams.toString());
          query.set('workspace', target.workspaceId);
          query.set('session', target.id);
          query.set('project', projectId);
          router.replace(`/studio?${query.toString()}`);
        }
      }
    } else {
      if (action === 'archive' && !window.confirm(`Archive ${target.title}?`)) return;
      if (action === 'delete' && !window.confirm(`Delete ${target.title}?`)) return;
      await fetchWithBrowserSession(`/api/studio/sessions/${target.id}?mode=${action === 'delete' ? 'delete' : 'archive'}`, { method: 'DELETE' });
      if (target.id === activeSessionId) {
        setActiveSessionId(null);
        if (pathname === '/studio') {
          const query = new URLSearchParams(searchParams.toString());
          query.delete('session');
          router.replace(`/studio?${query.toString()}`);
        }
      }
    }
    await refreshShell();
  }, [activeSessionId, pathname, refreshShell, router, searchParams, setActiveSession]);

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
  const navigationContext = useMemo<ShellNavigationContext>(() => ({
    workspaceId: activeWorkspaceId,
    projectId: activeProjectId,
    sessionId: activeSessionId,
  }), [activeProjectId, activeSessionId, activeWorkspaceId]);

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

  async function logoutAllDevices() {
    await fetch('/api/settings/sessions', { method: 'DELETE', credentials: 'include' }).catch(() => null);
    await destroyBrowserSession();
    router.replace('/signin');
  }

  async function updateNotificationStatus(item: NotificationRef, status: NotificationRef['status']) {
    await fetchWithBrowserSession('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationId: item.id, status }),
    });
    await loadNotifications();
    await refreshShell();
  }

  async function markAllNotificationsRead() {
    await fetchWithBrowserSession('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_all_read' }),
    });
    await loadNotifications();
    await refreshShell();
  }

  async function openNotification(item: NotificationRef) {
    if (item.status === 'unread') {
      await updateNotificationStatus(item, 'read');
    }
    setNotificationDrawerOpen(false);
    beginNavigationMetric();
    router.push(notificationHref(item));
  }

  function submitShellSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = shellSearch.trim();
    if (!query) return;
    beginNavigationMetric();
    router.push(`/search?q=${encodeURIComponent(query)}`);
  }

  const pageTitle = pageTitleForProductPath(pathname);
  const primaryAction = primaryActionForProductPath(pathname);
  const unreadBadge = badgeCount(payload.notifications.unread);

  return (
    <ApplicationShellContext.Provider value={contextValue}>
      <div
        className="agentos-global-shell"
        data-left-collapsed={leftCollapsed ? 'true' : 'false'}
        data-right-collapsed={rightCollapsed ? 'true' : 'false'}
        data-left-open={leftDrawerOpen ? 'true' : 'false'}
        data-right-open={rightDrawerOpen ? 'true' : 'false'}
        data-studio={pathname === '/studio' ? 'true' : 'false'}
        data-shell-instance={SHELL_INSTANCE_ID}
      >
        <header className="agentos-global-header">
          <button type="button" className="agentos-shell-mobile-button left" onClick={() => setLeftDrawerOpen(true)} aria-label="Open navigation">
            <span className="agentos-shell-mobile-icon menu" aria-hidden="true" />
            <span className="agentos-sr-only">Open navigation</span>
          </button>
          <Link href="/" className="agentos-global-brand" aria-label="AgentOS Home">
            <Image src="/logo.png" alt="" width={26} height={26} />
            <strong>AgentOS</strong>
          </Link>
          <h1 className="agentos-global-title">{pageTitle}</h1>
          <div className="agentos-global-breadcrumbs" aria-label="Current operating context">
            <span>{workspace?.name ?? 'Workspace'}</span>
            <span>{project?.name ?? 'No project'}</span>
            <span>{activeSession?.title ?? 'No session'}</span>
            {pathname === '/studio' ? <span>{formatMode(mode)}</span> : null}
            {pathname === '/studio' ? <span>{process.env.NEXT_PUBLIC_AGENTOS_MODEL ?? 'Default model'}</span> : null}
          </div>
          <div className="agentos-global-header-actions">
            <form className="agentos-global-search" role="search" onSubmit={submitShellSearch}>
              <input value={shellSearch} onChange={event => setShellSearch(event.target.value)} placeholder="Search" aria-label="Search AgentOS" />
            </form>
            {primaryAction ? (
              <Link className="agentos-global-primary-action" href={appendShellContextToHref(primaryAction.href, navigationContext)}>
                <span className="agentos-global-primary-action-icon" aria-hidden="true" />
                <span className="agentos-global-primary-action-label">{primaryAction.label}</span>
              </Link>
            ) : null}
            <button
              type="button"
              className="agentos-notification-bell"
              onClick={() => setNotificationDrawerOpen(value => !value)}
              aria-label={`${payload.notifications.unread} unread notifications`}
            >
              <span className="agentos-bell-icon" aria-hidden="true" />
              {unreadBadge ? <b>{unreadBadge}</b> : null}
            </button>
            {session ? (
              <details className="agentos-avatar-menu">
                <summary className="agentos-global-user" aria-label="Open account menu">
                  <span>{initials(session)}</span>
                  <b>{session.agentName ?? 'Account'}</b>
                </summary>
                <div className="agentos-avatar-menu-panel">
                  <div className="agentos-avatar-menu-identity">
                    <strong>{session.agentName ?? 'AgentOS User'}</strong>
                    <span>{session.planLabel ?? session.plan ?? 'Current plan'}</span>
                  </div>
                  {ACCOUNT_MENU_LINKS.map(item => (
                    <Link key={item.label} href={item.href}>{item.label}</Link>
                  ))}
                  <button type="button" aria-label="Sign Out" onClick={() => void logout()}>Logout</button>
                  <button type="button" aria-label="Sign Out All Devices" onClick={() => void logoutAllDevices()}>Logout All Devices</button>
                </div>
              </details>
            ) : <Link href="/signin">Sign in</Link>}
          </div>
          <button type="button" className="agentos-shell-mobile-button right" onClick={() => setRightDrawerOpen(true)} aria-label="Open context">
            <span className="agentos-shell-mobile-icon context" aria-hidden="true" />
            <span className="agentos-sr-only">Open context</span>
          </button>
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
            activeProjectId={activeProjectId}
            activeSessionId={activeSessionId}
            navigationContext={navigationContext}
            collapsed={leftCollapsed}
            onWorkspace={setActiveWorkspace}
            onProject={setActiveProject}
            onSession={setActiveSession}
            onSessionAction={(target, action, projectId) => void manageSession(target, action, projectId)}
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

        <NotificationDrawer
          open={notificationDrawerOpen}
          notifications={notifications}
          loading={notificationsLoading}
          unread={payload.notifications.unread}
          onClose={() => setNotificationDrawerOpen(false)}
          onOpen={item => void openNotification(item)}
          onMark={(item, status) => void updateNotificationStatus(item, status)}
          onMarkAllRead={() => void markAllNotificationsRead()}
        />

        {(leftDrawerOpen || rightDrawerOpen || notificationDrawerOpen) ? (
          <button
            type="button"
            className="agentos-shell-backdrop"
            onClick={() => {
              setLeftDrawerOpen(false);
              setRightDrawerOpen(false);
              setNotificationDrawerOpen(false);
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
