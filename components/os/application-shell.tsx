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
const EXCLUDED_PREFIXES = ['/', '/signin', '/signup', '/login', '/forgot-password'];

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
  if (value === 'workflow') return 'Primeflow Builder';
  if (value === 'code') return 'Code Studio';
  return 'NL Studio';
}

function SurfaceIcon({ id }: { id: string }) {
  const common = { 'aria-hidden': true, viewBox: '0 0 24 24' };
  if (id === 'home') return <svg {...common}><path d="M4 11.5 12 5l8 6.5" /><path d="M6.5 10.5V20h11v-9.5" /><path d="M10 20v-5h4v5" /></svg>;
  if (id === 'studio') return <svg {...common}><path d="M12 3v4" /><path d="M12 17v4" /><path d="M3 12h4" /><path d="M17 12h4" /><path d="m6.8 6.8 2.8 2.8" /><path d="m14.4 14.4 2.8 2.8" /><path d="m17.2 6.8-2.8 2.8" /><path d="m9.6 14.4-2.8 2.8" /></svg>;
  if (id === 'search') return <svg {...common}><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>;
  if (id === 'tasks') return <svg {...common}><path d="M8 6h12" /><path d="M8 12h12" /><path d="M8 18h12" /><path d="m3.8 6 .7.7L6 5" /><path d="m3.8 12 .7.7L6 11" /><path d="m3.8 18 .7.7L6 17" /></svg>;
  if (id === 'projects') return <svg {...common}><path d="M4 7h6l2 2h8v10H4z" /><path d="M4 7V5h6l2 2" /></svg>;
  if (id === 'library') return <svg {...common}><path d="M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z" /><path d="M7 18h12" /><path d="M8 8h7" /></svg>;
  if (id === 'appstore') return <svg {...common}><rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" /><rect x="4" y="14" width="6" height="6" rx="1.5" /><rect x="14" y="14" width="6" height="6" rx="1.5" /></svg>;
  if (id === 'skillstore') return <svg {...common}><path d="M12 3 4 7v6c0 4 3.2 6.6 8 8 4.8-1.4 8-4 8-8V7z" /><path d="m9 12 2 2 4-5" /></svg>;
  if (id === 'subagents') return <svg {...common}><circle cx="12" cy="7" r="3" /><path d="M5 21a7 7 0 0 1 14 0" /><path d="M5 10a3 3 0 0 0 3 3" /><path d="M19 10a3 3 0 0 1-3 3" /></svg>;
  if (id === 'workflows') return <svg {...common}><circle cx="5" cy="6" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><path d="M7 6h10" /><path d="M6.5 8 11 16" /><path d="m17.5 8-4.5 8" /></svg>;
  if (id === 'memory') return <svg {...common}><path d="M8 4h8a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z" /><path d="M9 8h6" /><path d="M9 12h6" /><path d="M9 16h3" /></svg>;
  if (id === 'vault') return <svg {...common}><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V8a4 4 0 0 1 8 0v2" /><circle cx="12" cy="15" r="1.5" /></svg>;
  if (id === 'universal-mcp') return <svg {...common}><path d="M12 4v16" /><path d="M4 12h16" /><circle cx="12" cy="12" r="3" /><path d="M5 5l3 3" /><path d="m19 5-3 3" /><path d="m5 19 3-3" /><path d="m19 19-3-3" /></svg>;
  if (id === 'developer') return <svg {...common}><path d="m9 8-4 4 4 4" /><path d="m15 8 4 4-4 4" /><path d="m13 5-2 14" /></svg>;
  if (id === 'community') return <svg {...common}><circle cx="8" cy="8" r="3" /><circle cx="17" cy="10" r="2.5" /><path d="M3 20a5 5 0 0 1 10 0" /><path d="M14 20a4 4 0 0 1 7 0" /></svg>;
  if (id === 'ffp') return <svg {...common}><path d="M12 3 4 7v10l8 4 8-4V7z" /><path d="M12 12 4 7" /><path d="m12 12 8-5" /><path d="M12 12v9" /></svg>;
  if (id === 'docs') return <svg {...common}><path d="M6 3h9l3 3v15H6z" /><path d="M15 3v4h4" /><path d="M9 12h6" /><path d="M9 16h6" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M12 2v3" /><path d="M12 19v3" /><path d="M2 12h3" /><path d="M19 12h3" /></svg>;
}

function badgeCount(value: number): string {
  if (value <= 0) return '';
  return value > 99 ? '99+' : String(value);
}

function surfaceBadgeCount(id: string, payload: ShellPayload): string {
  if (id === 'home') return badgeCount(payload.notifications.unread);
  if (id === 'studio') return badgeCount(payload.sessions.filter(item => !item.archivedAt).length);
  if (id === 'projects') return badgeCount(payload.projects.filter(item => item.status !== 'archived').length);
  if (id === 'developer') return badgeCount(payload.agents.connected);
  return '';
}

function surfaceBadgeLabel(id: string) {
  if (id === 'home') return 'unread notifications';
  if (id === 'studio') return 'active sessions';
  if (id === 'projects') return 'projects';
  if (id === 'developer') return 'connected agents';
  return 'items';
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

function notificationRepeatCount(item: NotificationRef): number {
  const count = Number(item.metadata.consolidatedCount ?? 1);
  return Number.isFinite(count) && count > 1 ? count : 1;
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

function CollapsedRightRail(props: {
  payload: ShellPayload;
  onExpand: () => void;
  onNotifications: () => void;
}) {
  const unreadBadge = badgeCount(props.payload.notifications.unread);
  const agentsBadge = badgeCount(props.payload.agents.connected);

  return (
    <div className="agentos-global-context-rail" aria-label="Context shortcuts">
      <button type="button" className="agentos-context-rail-button" onClick={props.onExpand} aria-label="Expand context sidebar" title="Context">
        <span className="agentos-context-rail-icon"><SurfaceIcon id="settings" /></span>
      </button>
      <button
        type="button"
        className="agentos-context-rail-button"
        onClick={props.onNotifications}
        aria-label={`Open notifications (${props.payload.notifications.unread} unread)`}
        title={`Open notifications (${props.payload.notifications.unread} unread)`}
      >
        <span className="agentos-context-rail-icon bell"><span className="agentos-bell-icon" aria-hidden="true" /></span>
        {unreadBadge ? <b>{unreadBadge}</b> : null}
      </button>
      <button
        type="button"
        className="agentos-context-rail-button"
        onClick={props.onExpand}
        aria-label={`${props.payload.agents.connected} connected agents`}
        title={`${props.payload.agents.connected} connected agents`}
      >
        <span className="agentos-context-rail-icon"><SurfaceIcon id="developer" /></span>
        {agentsBadge ? <b>{agentsBadge}</b> : null}
      </button>
      <button type="button" className="agentos-context-rail-button" onClick={props.onExpand} aria-label="FFP status: Coming Soon" title="FFP: Coming Soon">
        <span className="agentos-context-rail-icon"><SurfaceIcon id="ffp" /></span>
        <small>Soon</small>
      </button>
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
    else grouped.get(notificationGroup(item.type))?.push(item);
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
                    <strong>{item.title}{notificationRepeatCount(item) > 1 ? ` (${notificationRepeatCount(item)} alerts)` : ''}</strong>
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
        {NAVIGATION_SURFACES.map(item => {
          const badge = surfaceBadgeCount(item.id, props.payload);
          return (
            <Link
              key={item.href}
              href={appendShellContextToHref(item.href, props.navigationContext)}
              className={[
                isProductSurfaceActivePath(props.pathname, item) ? 'active' : '',
                item.status === 'coming_soon' ? 'coming-soon' : '',
              ].filter(Boolean).join(' ')}
              title={item.disabledReason ?? item.label}
              aria-label={badge ? `${item.label}, ${surfaceBadgeLabel(item.id)} count ${badge}` : item.label}
              onClick={() => {
                beginNavigationMetric();
                props.onCloseMobile();
              }}
            >
              <i aria-hidden="true"><SurfaceIcon id={item.id} /></i>
              <b>{item.label}</b>
              {badge ? <span className="agentos-nav-badge" aria-hidden="true">{badge}</span> : null}
              {item.status === 'coming_soon' ? <small>Soon</small> : null}
            </Link>
          );
        })}
      </nav>

      <section className="agentos-global-quick">
        <h2>Quick Actions</h2>
        <button type="button" onClick={() => navigate('/studio?mode=nl')}>New Chat</button>
        <button type="button" onClick={() => navigate('/studio?mode=workflow&new=1')}>New Primeflow</button>
        <button type="button" onClick={() => navigate('/projects?create=1')}>New Project</button>
        <button type="button" onClick={() => navigate('/subagents?create=1')}>New Prime Agent</button>
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
          <CollapsedRightRail
            payload={payload}
            onExpand={() => setRightCollapsed(false)}
            onNotifications={() => setNotificationDrawerOpen(value => !value)}
          />
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
