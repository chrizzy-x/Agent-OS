'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import { Drawer } from '@/components/os/overlays';
import { AppShell, Badge, Button, SidebarNav, SidebarSection } from '@/components/os/ui';

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

function workspaceHref(id: string): string {
  return `/workspace?workspace=${encodeURIComponent(id)}`;
}

export default function WorkspaceShell(props: WorkspaceShellProps) {
  const [session, setSession] = useState<BrowserSession | null>(props.session ?? null);
  const [workspaces, setWorkspaces] = useState<WorkspaceRef[]>(props.workspaces ?? []);
  const [sessions, setSessions] = useState<SessionRef[]>(props.sessions ?? []);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileRailOpen, setMobileRailOpen] = useState(false);

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
    function handleShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key === '\\') {
        event.preventDefault();
        setCollapsed(current => !current);
      }
    }

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  const currentWorkspaceId = props.currentWorkspaceId ?? workspaces[0]?.id ?? null;
  const currentWorkspace = workspaces.find(item => item.id === currentWorkspaceId) ?? workspaces[0] ?? null;
  const enterprise = session?.accountType === 'enterprise' || session?.capabilities?.includes('access_sdk') === true;

  const recentSessions = useMemo(
    () => sessions
      .filter(item => !currentWorkspaceId || item.workspaceId === currentWorkspaceId)
      .slice(0, 8),
    [currentWorkspaceId, sessions],
  );

  const rail = (
    <div className="os-workspace-rail">
      <SidebarSection
        title="Workspace"
        footer={(
          <div className="os-inline-actions">
            <Button variant="secondary" onClick={() => setCollapsed(current => !current)}>
              {collapsed ? 'Expand' : 'Collapse'}
            </Button>
            <Badge tone="accent">{session?.planLabel ?? currentWorkspace?.plan ?? 'Retail Free'}</Badge>
          </div>
        )}
      >
        {currentWorkspace ? (
          <SidebarNav
            items={workspaces.length > 0 ? workspaces.map(item => ({
              href: workspaceHref(item.id),
              label: item.name,
              subtitle: item.plan ?? 'workspace',
              active: item.id === currentWorkspace.id,
            })) : [{
              href: '/workspace',
              label: currentWorkspace.name,
              subtitle: currentWorkspace.plan ?? 'workspace',
              active: true,
            }]}
          />
        ) : (
          <div className="os-empty-body">No workspace selected.</div>
        )}
      </SidebarSection>

      {recentSessions.length > 0 ? (
        <SidebarSection title="Sessions">
          <SidebarNav
            items={recentSessions.map(item => ({
              href: `/studio?session=${encodeURIComponent(item.id)}`,
              label: item.title,
              subtitle: item.branchLabel || item.status || new Date(item.updatedAt).toLocaleDateString(),
              active: props.activePath === '/studio' && item.id === props.currentSessionId,
            }))}
          />
        </SidebarSection>
      ) : null}

      <SidebarSection title="Studio">
        <SidebarNav
          items={[
            { href: '/studio', label: 'Studio', subtitle: 'Conversation', active: props.activePath === '/studio' },
            { href: '/workspace', label: 'Workspace', subtitle: 'Hub', active: props.activePath === '/workspace' || props.activePath === '/workspaces' || props.activePath === '/dashboard' },
            { href: '/projects', label: 'Projects', subtitle: 'Collection', active: props.activePath === '/projects' },
            { href: '/search', label: 'Search', subtitle: 'Command center', active: props.activePath === '/search' },
          ]}
        />
      </SidebarSection>

      <SidebarSection title="Runtime">
        <SidebarNav
          items={[
            { href: '/appstore', label: 'Apps', subtitle: 'Install and open', active: props.activePath === '/appstore' },
            { href: '/skills', label: 'Skills', subtitle: 'Installed and marketplace', active: props.activePath === '/skills' },
            { href: '/workflows', label: 'Workflows', subtitle: 'Automations', active: props.activePath === '/workflows' },
            { href: '/agents', label: 'Agents', subtitle: 'Subagents', active: props.activePath === '/agents' },
            { href: '/vault', label: 'Vault', subtitle: 'Secrets', active: props.activePath === '/vault' },
          ]}
        />
      </SidebarSection>

      <SidebarSection title="Enterprise">
        <SidebarNav
          items={[
            { href: '/sdk', label: 'SDK', subtitle: 'Credentials and apps', active: props.activePath === '/sdk', locked: !enterprise },
            { href: '/developer', label: 'Developer Console', subtitle: 'Publish and monitor', active: props.activePath === '/developer', locked: !enterprise },
            { href: '/connectors', label: 'Universal MCP', subtitle: 'Connectors', active: props.activePath === '/connectors' || props.activePath === '/mcp', locked: !enterprise },
            { href: '/ffp', label: 'FFP Router', subtitle: 'Routing and fallback', active: props.activePath === '/ffp', locked: !enterprise },
            { href: '/analytics', label: 'Analytics', subtitle: 'Usage and health', active: props.activePath === '/analytics', locked: !enterprise },
            { href: '/audit', label: 'Audit', subtitle: 'Runtime history', active: props.activePath === '/audit', locked: !enterprise },
            { href: '/settings', label: 'Settings', subtitle: 'Profile and workspace', active: props.activePath === '/settings' },
          ]}
        />
      </SidebarSection>

      {props.extraSidebar}
    </div>
  );

  return (
    <>
      <div className="os-workspace-mobile-bar">
        <Button variant="secondary" onClick={() => setMobileRailOpen(true)}>
          {props.mobileTitle ?? currentWorkspace?.name ?? 'Workspace'}
        </Button>
        {currentWorkspace ? <Badge tone="accent">{currentWorkspace.name}</Badge> : null}
      </div>
      <AppShell className={`os-workspace-shell${collapsed ? ' collapsed' : ''}`} sidebar={rail} aside={props.aside}>
        {props.children}
      </AppShell>
      <Drawer
        open={mobileRailOpen}
        onClose={() => setMobileRailOpen(false)}
        title={props.mobileTitle ?? currentWorkspace?.name ?? 'Workspace'}
        description="Workspace navigation"
        size="md"
      >
        {rail}
      </Drawer>
    </>
  );
}
