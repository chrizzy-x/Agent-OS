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
const EXCLUDED_PREFIXES = ['/signin', '/signup', '/login', '/forgot-password', '/onboarding'];
const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: 'H' },
  { href: '/studio', label: 'Studio', icon: 'S' },
  { href: '/search', label: 'Search', icon: 'Q' },
  { href: '/tasks', label: 'Tasks', icon: 'J' },
  { href: '/projects', label: 'Projects', icon: 'P' },
  { href: '/library', label: 'Library', icon: 'L' },
  { href: '/appstore', label: 'App Store', icon: 'A' },
  { href: '/skillstore', label: 'Skill Store', icon: 'K', aliases: ['/skills'] },
  { href: '/subagents', label: 'Subagents', icon: 'G', aliases: ['/agents'] },
  { href: '/workflows', label: 'Workflows', icon: 'W' },
  { href: '/memory', label: 'Memory', icon: 'M' },
  { href: '/vault', label: 'Vault', icon: 'V' },
  { href: '/mcp', label: 'MCP', icon: 'U', aliases: ['/connectors'] },
  { href: '/developer', label: 'Developer', icon: 'D', aliases: ['/publish'] },
  { href: '/community', label: 'Community', icon: 'C' },
  { href: '/ffp', label: 'FFP', icon: 'F' },
  { href: '/resources', label: 'Resources', icon: 'R', aliases: ['/docs'] },
  { href: '/settings', label: 'Settings', icon: 'T', aliases: ['/profile', '/billing'] },
] as const;

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

const PAGE_TITLES: Array<{ prefix: string; title: string }> = [
  { prefix: '/studio', title: 'Studio' },
  { prefix: '/search', title: 'Search' },
  { prefix: '/tasks', title: 'Tasks' },
  { prefix: '/library', title: 'Library' },
  { prefix: '/appstore', title: 'App Store' },
  { prefix: '/skillstore', title: 'Skill Store' },
  { prefix: '/skills', title: 'Skills' },
  { prefix: '/developer', title: 'Developer' },
  { prefix: '/projects', title: 'Projects' },
  { prefix: '/subagents', title: 'Subagents' },
  { prefix: '/agents', title: 'Subagents' },
  { prefix: '/workflows', title: 'Workflows' },
  { prefix: '/memory', title: 'Memory' },
  { prefix: '/vault', title: 'Vault' },
  { prefix: '/mcp', title: 'Universal MCP' },
  { prefix: '/community', title: 'Community' },
  { prefix: '/ffp', title: 'FFP' },
  { prefix: '/resources', title: 'Resources' },
  { prefix: '/settings', title: 'Settings' },
];

const PRIMARY_ACTIONS: Array<{ prefix: string; label: string; href: string }> = [
  { prefix: '/studio', label: 'Create', href: '/studio?mode=nl' },
  { prefix: '/tasks', label: 'New Chat', href: '/studio?mode=nl' },
  { prefix: '/appstore', label: 'Install', href: '/appstore' },
  { prefix: '/skillstore', label: 'Install', href: '/skillstore' },
  { prefix: '/developer', label: 'Publish', href: '/publish/app' },
  { prefix: '/projects', label: 'Create', href: '/projects?create=1' },
  { prefix: '/subagents', label: 'Create', href: '/subagents?create=1' },
  { prefix: '/agents', label: 'Create', href: '/subagents?create=1' },
  { prefix: '/workflows', label: 'Create', href: '/studio?mode=workflow&new=1' },
  { prefix: '/vault', label: 'Save', href: '/vault?create=secret' },
  { prefix: '/settings', label: 'Save', href: '/settings' },
];

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

function pageTitleForPath(pathname: string): string {
  if (pathname === '/') return 'Home';
  return PAGE_TITLES.find(item => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`))?.title ?? 'AgentOS';
}

function primaryActionForPath(pathname: string) {
  return PRIMARY_ACTIONS.find(item => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`)) ?? null;
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

  const pageTitle = pageTitleForPath(pathname);
  const primaryAction = primaryActionForPath(pathname);
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
          <button type="button" className="agentos-shell-mobile-button left" onClick={() => setLeftDrawerOpen(true)} aria-label="Open navigation">Menu</button>
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
            {primaryAction ? <Link className="agentos-global-primary-action" href={primaryAction.href}>{primaryAction.label}</Link> : null}
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
