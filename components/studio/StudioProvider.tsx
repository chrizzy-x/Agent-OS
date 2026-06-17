'use client';

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
import { useRouter, useSearchParams } from 'next/navigation';
import {
  createStudioAdvancedSession,
  getStudioAdvancedSessionKey,
  isStudioAdvancedSessionActive,
  parseStudioAdvancedSession,
} from '@/src/studio/client-state';
import { fetchBrowserSessionState, fetchWithBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import type {
  StudioContextSection,
  StudioEditorTab,
  StudioFileNode,
  StudioMode,
  StudioTerminalEvent,
  StudioTerminalSession,
} from '@/src/studio/types';

type StudioSessionRecord = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  title: string;
  visibility: 'private' | 'workspace' | 'public';
  linkedSubagentId?: string | null;
  linkedWorkflowId?: string | null;
  linkedAppId?: string | null;
  linkedFilePaths?: string[];
  linkedMemoryRefs?: string[];
  updatedAt: string;
  pinnedAt?: string | null;
  archivedAt?: string | null;
  deletedAt?: string | null;
};

type StudioMessageRecord = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
};

type StudioEventRecord = {
  id: string;
  type: string;
  createdAt: string;
  payload: Record<string, unknown>;
};

type WorkspaceRecord = {
  id: string;
  name: string;
};

type ProjectRecord = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  status: string;
};

type StudioLineage = {
  parent: { id: string; title: string; updatedAt: string } | null;
  children: Array<{ id: string; title: string; updatedAt: string }>;
};

type WorkflowRecord = {
  id: string;
  name: string;
  summary: string | null;
  status: string;
  visibility?: 'private' | 'workspace' | 'public';
};

type VaultSecretRecord = {
  id: string;
  name: string;
  status: string;
};

type InstalledSkillRecord = {
  id: string;
  name: string;
  slug: string;
  description: string;
};

type InstalledAppRecord = {
  id: string;
  name: string;
  slug: string;
  description: string;
};

type SubagentRecord = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  name: string;
  description: string | null;
  visibility: 'private' | 'workspace' | 'public';
  exposedCapabilities: string[];
  status: string;
  updatedAt: string;
};

type MemoryEntryRecord = {
  id: string;
  key: string;
  content: string;
  visibility: 'private' | 'workspace' | 'public';
  namespaceType: string;
  namespaceId: string | null;
  updatedAt: string;
};

type FileEntryRecord = {
  id: string;
  path: string;
  visibility: 'private' | 'workspace' | 'public';
  metadata: Record<string, unknown>;
  updatedAt: string;
};

type ExecutionRecord = {
  id: string;
  title: string;
  status: 'QUEUED' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  sourceType: string;
  sourceId: string | null;
  sessionId: string | null;
  failure: Record<string, unknown> | null;
  output: unknown;
  durationMs: number | null;
  estimatedCost: number;
  updatedAt: string;
  createdAt: string;
};

type NotificationRecord = {
  id: string;
  type: string;
  title: string;
  body: string;
  status: 'unread' | 'read' | 'archived';
  executionId: string | null;
  createdAt: string;
};

type SuperAgentRecord = {
  id: string;
  name: string;
  instructions: string;
  status: string;
};

type PendingApproval = {
  confirmToken: string;
  reply: string;
};

type StudioContextValue = {
  loading: boolean;
  sending: boolean;
  browserSession: BrowserSession | null;
  mode: StudioMode;
  setMode: (mode: StudioMode) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  contextOpen: boolean;
  openContext: (section: StudioContextSection) => void;
  closeContext: () => void;
  contextSection: StudioContextSection;
  session: StudioSessionRecord | null;
  sessions: StudioSessionRecord[];
  lineage: StudioLineage;
  messages: StudioMessageRecord[];
  events: StudioEventRecord[];
  workspaces: WorkspaceRecord[];
  projects: ProjectRecord[];
  currentProject: ProjectRecord | null;
  workflows: WorkflowRecord[];
  vaultSecrets: VaultSecretRecord[];
  installedSkills: InstalledSkillRecord[];
  installedApps: InstalledAppRecord[];
  superAgent: SuperAgentRecord | null;
  subagents: SubagentRecord[];
  activeSubagent: SubagentRecord | null;
  memoryEntries: MemoryEntryRecord[];
  fileEntries: FileEntryRecord[];
  executions: ExecutionRecord[];
  recoveryExecutions: ExecutionRecord[];
  notifications: NotificationRecord[];
  fileTree: StudioFileNode[];
  tabs: StudioEditorTab[];
  activeTabId: string | null;
  setActiveTabId: (id: string | null) => void;
  terminal: StudioTerminalSession | null;
  terminalEvents: StudioTerminalEvent[];
  terminalDraft: string;
  setTerminalDraft: (value: string) => void;
  advancedMode: boolean;
  enableAdvancedMode: () => void;
  pendingApproval: PendingApproval | null;
  setComposerValue: (value: string) => void;
  composerValue: string;
  sendMessage: (message?: string) => Promise<void>;
  stopGeneration: () => Promise<void>;
  approvePending: () => Promise<void>;
  createSession: (options?: { linkedSubagentId?: string | null; title?: string }) => Promise<StudioSessionRecord | null>;
  focusSubagent: (subagentId: string) => Promise<void>;
  createSubagent: (input: {
    name: string;
    description?: string;
    visibility?: 'private' | 'workspace' | 'public';
    exposedCapabilities?: string[];
  }) => Promise<SubagentRecord | null>;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  pinSession: (sessionId: string, pinned: boolean) => Promise<void>;
  archiveSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  selectSession: (sessionId: string) => void;
  selectProject: (projectId: string) => void;
  openFile: (path: string) => Promise<void>;
  updateTabContent: (tabId: string, content: string) => void;
  saveActiveTab: () => Promise<void>;
  refreshFiles: () => Promise<void>;
  startTerminal: () => Promise<void>;
  sendTerminalInput: () => Promise<void>;
  panicStop: () => Promise<void>;
  requestExecutionAction: (executionId: string, action: 'pause' | 'resume' | 'retry' | 'cancel' | 'rollback') => Promise<void>;
  markNotification: (notificationId: string, status: 'read' | 'unread' | 'archived') => Promise<void>;
  refresh: () => Promise<void>;
};

const StudioContext = createContext<StudioContextValue | null>(null);

function normalizeMode(value: string | null | undefined): StudioMode {
  return value === 'code' || value === 'workflow' ? value : 'nl';
}

function buildStudioUrl(params: {
  mode: StudioMode;
  sessionId?: string | null;
  projectId?: string | null;
}): string {
  const query = new URLSearchParams();
  query.set('mode', params.mode);
  if (params.sessionId) query.set('session', params.sessionId);
  if (params.projectId) query.set('project', params.projectId);
  return `/studio?${query.toString()}`;
}

function parseStudioStreamPayload(raw: string): Record<string, unknown> {
  let payload: Record<string, unknown> = {};
  for (const block of raw.split('\n\n')) {
    const lines = block.split('\n');
    const event = lines.find(line => line.startsWith('event: '))?.slice('event: '.length).trim();
    const data = lines.find(line => line.startsWith('data: '))?.slice('data: '.length);
    if (!event || !data || (event !== 'reply' && event !== 'error')) continue;
    try {
      payload = JSON.parse(data) as Record<string, unknown>;
    } catch {
      payload = { kind: 'error', reply: 'I could not read the execution result. Inspect Recovery for details.' };
    }
  }
  return payload;
}

function flattenFiles(nodes: StudioFileNode[]): StudioFileNode[] {
  return nodes.flatMap(node => [node, ...(node.children ? flattenFiles(node.children) : [])]);
}

function mapInstalledSkills(input: unknown): InstalledSkillRecord[] {
  return (Array.isArray(input) ? input : []).map((item, index) => {
    const skill = item && typeof item === 'object' && 'skill' in item
      ? (item as { skill?: Record<string, unknown> }).skill
      : item as Record<string, unknown> | null;
    return {
      id: String(skill?.id ?? skill?.slug ?? `skill-${index}`),
      name: String(skill?.name ?? 'Skill'),
      slug: String(skill?.slug ?? skill?.name ?? `skill-${index}`),
      description: String(skill?.description ?? 'Installed capability'),
    };
  });
}

function mapInstalledApps(input: unknown): InstalledAppRecord[] {
  return (Array.isArray(input) ? input : []).map((item, index) => ({
    id: String((item as Record<string, unknown>)?.id ?? `app-${index}`),
    name: String((item as Record<string, unknown>)?.name ?? 'App'),
    slug: String((item as Record<string, unknown>)?.slug ?? `app-${index}`),
    description: String((item as Record<string, unknown>)?.description ?? 'Installed app'),
  }));
}

export function StudioProvider(props: {
  initialSessionId?: string | null;
  initialPrompt?: string | null;
  initialMode?: StudioMode;
  children: ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedMode = normalizeMode(searchParams.get('mode') ?? props.initialMode);
  const requestedSessionId = searchParams.get('session') ?? props.initialSessionId ?? null;
  const requestedProjectId = searchParams.get('project');
  const advancedKey = getStudioAdvancedSessionKey('studio-shell');

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [browserSession, setBrowserSession] = useState<BrowserSession | null>(null);
  const [mode, setModeState] = useState<StudioMode>(requestedMode);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [contextSection, setContextSection] = useState<StudioContextSection>('apps');
  const [session, setSession] = useState<StudioSessionRecord | null>(null);
  const [sessions, setSessions] = useState<StudioSessionRecord[]>([]);
  const [lineage, setLineage] = useState<StudioLineage>({ parent: null, children: [] });
  const [messages, setMessages] = useState<StudioMessageRecord[]>([]);
  const [events, setEvents] = useState<StudioEventRecord[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [currentProject, setCurrentProject] = useState<ProjectRecord | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [vaultSecrets, setVaultSecrets] = useState<VaultSecretRecord[]>([]);
  const [installedSkills, setInstalledSkills] = useState<InstalledSkillRecord[]>([]);
  const [installedApps, setInstalledApps] = useState<InstalledAppRecord[]>([]);
  const [superAgent, setSuperAgent] = useState<SuperAgentRecord | null>(null);
  const [subagents, setSubagents] = useState<SubagentRecord[]>([]);
  const [memoryEntries, setMemoryEntries] = useState<MemoryEntryRecord[]>([]);
  const [fileEntries, setFileEntries] = useState<FileEntryRecord[]>([]);
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [recoveryExecutions, setRecoveryExecutions] = useState<ExecutionRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [fileTree, setFileTree] = useState<StudioFileNode[]>([]);
  const [tabs, setTabs] = useState<StudioEditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [terminal, setTerminal] = useState<StudioTerminalSession | null>(null);
  const [terminalEvents, setTerminalEvents] = useState<StudioTerminalEvent[]>([]);
  const [terminalDraft, setTerminalDraft] = useState('');
  const [advancedMode, setAdvancedMode] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [composerValue, setComposerValue] = useState(props.initialPrompt ?? '');
  const streamAbortRef = useRef<AbortController | null>(null);
  const activeStreamExecutionIdRef = useRef<string | null>(null);

  const currentWorkspaceId = session?.workspaceId ?? currentProject?.workspaceId ?? workspaces[0]?.id ?? null;
  const activeSubagent = useMemo(
    () => session?.linkedSubagentId ? subagents.find(item => item.id === session.linkedSubagentId) ?? null : null,
    [session?.linkedSubagentId, subagents],
  );

  const pushRoute = useCallback((nextMode: StudioMode, nextSessionId?: string | null, nextProjectId?: string | null) => {
    router.replace(buildStudioUrl({
      mode: nextMode,
      sessionId: nextSessionId ?? session?.id ?? requestedSessionId,
      projectId: nextProjectId ?? currentProject?.id ?? requestedProjectId,
    }));
  }, [currentProject?.id, requestedProjectId, requestedSessionId, router, session?.id]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const auth = await fetchBrowserSessionState().catch(() => ({ state: 'signed_out' as const, session: null }));
    setBrowserSession(auth.session);
    if (!auth.session) {
      setLoading(false);
      return;
    }

    const params = new URLSearchParams();
    params.set('mode', requestedMode);
    if (requestedSessionId) params.set('session', requestedSessionId);
    if (requestedProjectId) params.set('project', requestedProjectId);
    const response = await fetchWithBrowserSession(`/api/studio/bootstrap?${params.toString()}`, {
      cache: 'no-store',
    });

    if (!response.response.ok) {
      setLoading(false);
      return;
    }

    const payload = await response.response.json() as Record<string, unknown>;
    const nextSession = (payload.session ?? null) as StudioSessionRecord | null;
    const nextProjects = (payload.projects ?? []) as ProjectRecord[];
    const nextCurrentProject = ((payload.currentProject as ProjectRecord | null) ?? null)
      || nextProjects.find(item => item.id === requestedProjectId)
      || nextProjects[0]
      || null;

    setModeState(normalizeMode(String(payload.mode ?? requestedMode)));
    setSession(nextSession);
    setSessions((payload.sessions ?? []) as StudioSessionRecord[]);
    setLineage((payload.lineage ?? { parent: null, children: [] }) as StudioLineage);
    setMessages((payload.messages ?? []) as StudioMessageRecord[]);
    setEvents((payload.events ?? []) as StudioEventRecord[]);
    setWorkspaces((payload.workspaces ?? []) as WorkspaceRecord[]);
    setProjects(nextProjects);
    setCurrentProject(nextCurrentProject);
    setWorkflows((payload.workflows ?? []) as WorkflowRecord[]);
    setVaultSecrets((payload.vaultSecrets ?? []) as VaultSecretRecord[]);
    setInstalledSkills(mapInstalledSkills(payload.installedSkills));
    setInstalledApps(mapInstalledApps(payload.installedApps));
    setSuperAgent((payload.superAgent ?? null) as SuperAgentRecord | null);
    setSubagents((payload.subagents ?? []) as SubagentRecord[]);
    setMemoryEntries((payload.memoryEntries ?? []) as MemoryEntryRecord[]);
    setFileTree((payload.fileTree ?? []) as StudioFileNode[]);
    setLoading(false);
  }, [requestedMode, requestedProjectId, requestedSessionId]);

  const refreshLinkedFiles = useCallback(async () => {
    const search = new URLSearchParams();
    if (session?.id) {
      search.set('sessionId', session.id);
    } else if (currentWorkspaceId) {
      search.set('workspaceId', currentWorkspaceId);
    } else {
      setFileEntries([]);
      return;
    }
    const response = await fetchWithBrowserSession(`/api/files?${search.toString()}`, { cache: 'no-store' });
    if (!response.response.ok) return;
    const payload = await response.response.json() as { entries?: FileEntryRecord[] };
    setFileEntries(payload.entries ?? []);
  }, [currentWorkspaceId, session?.id]);

  const refreshRuntimeState = useCallback(async () => {
    if (!currentWorkspaceId && !session?.id) {
      setExecutions([]);
      setRecoveryExecutions([]);
      setNotifications([]);
      return;
    }
    const executionParams = new URLSearchParams();
    executionParams.set('limit', '40');
    if (session?.id) executionParams.set('sessionId', session.id);
    if (currentWorkspaceId) executionParams.set('workspaceId', currentWorkspaceId);
    const recoveryParams = new URLSearchParams(executionParams);
    const [executionResponse, recoveryResponse, notificationResponse] = await Promise.all([
      fetchWithBrowserSession(`/api/executions?${executionParams.toString()}`, { cache: 'no-store' }),
      fetchWithBrowserSession(`/api/recovery?${recoveryParams.toString()}`, { cache: 'no-store' }),
      fetchWithBrowserSession('/api/notifications?status=all&limit=30', { cache: 'no-store' }),
    ]);
    if (executionResponse.response.ok) {
      const payload = await executionResponse.response.json() as { executions?: ExecutionRecord[] };
      setExecutions(payload.executions ?? []);
    }
    if (recoveryResponse.response.ok) {
      const payload = await recoveryResponse.response.json() as { executions?: ExecutionRecord[] };
      setRecoveryExecutions(payload.executions ?? []);
    }
    if (notificationResponse.response.ok) {
      const payload = await notificationResponse.response.json() as { notifications?: NotificationRecord[] };
      setNotifications(payload.notifications ?? []);
    }
  }, [currentWorkspaceId, session?.id]);

  const refreshFiles = useCallback(async () => {
    const projectId = currentProject?.id;
    if (!projectId) return;
    const response = await fetchWithBrowserSession(`/api/studio/projects/${projectId}/files`, { cache: 'no-store' });
    if (!response.response.ok) return;
    const payload = await response.response.json() as { files?: StudioFileNode[] };
    setFileTree(payload.files ?? []);
  }, [currentProject?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void refreshLinkedFiles();
  }, [refreshLinkedFiles]);

  useEffect(() => {
    void refreshRuntimeState();
  }, [refreshRuntimeState]);

  useEffect(() => {
    setModeState(requestedMode);
  }, [requestedMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setAdvancedMode(isStudioAdvancedSessionActive(parseStudioAdvancedSession(window.localStorage.getItem(advancedKey))));
  }, [advancedKey]);

  useEffect(() => {
    if (mode !== 'code' || tabs.length > 0) return;
    const firstFile = flattenFiles(fileTree).find(node => node.kind === 'file');
    if (firstFile) {
      void openFile(firstFile.path);
    }
  }, [currentProject?.id, fileTree, mode, tabs.length]);

  useEffect(() => {
    if (!terminal?.id) return;
    const source = new EventSource(`/api/studio/terminals/${terminal.id}/stream?cursor=0`);

    const onTerminalEvent = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as StudioTerminalEvent;
        setTerminalEvents(current => current.some(item => item.id === payload.id) ? current : [...current, payload]);
        setTerminal(current => current ? {
          ...current,
          status: payload.status ?? current.status,
          updatedAt: payload.createdAt ?? current.updatedAt,
        } : current);
        if (payload.type === 'sync') {
          void refreshFiles();
        }
      } catch {
        // no-op
      }
    };

    source.addEventListener('terminal_event', onTerminalEvent as EventListener);
    return () => {
      source.removeEventListener('terminal_event', onTerminalEvent as EventListener);
      source.close();
    };
  }, [refreshFiles, terminal?.id]);

  useEffect(() => {
    if (!terminal || !currentProject || terminal.projectId === currentProject.id) return;
    setTerminal(null);
    setTerminalEvents([]);
  }, [currentProject, terminal]);

  const setMode = useCallback((nextMode: StudioMode) => {
    setModeState(nextMode);
    pushRoute(nextMode);
  }, [pushRoute]);

  const openContext = useCallback((section: StudioContextSection) => {
    setContextSection(section);
    setContextOpen(true);
  }, []);

  const closeContext = useCallback(() => {
    setContextOpen(false);
  }, []);

  const createSession = useCallback(async (options?: { linkedSubagentId?: string | null; title?: string }) => {
    if (!currentWorkspaceId) return null;
    const response = await fetchWithBrowserSession('/api/studio/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: currentWorkspaceId,
        projectId: currentProject?.id ?? requestedProjectId,
        linkedSubagentId: options?.linkedSubagentId ?? null,
        title: options?.title ?? 'New chat',
      }),
    });
    if (!response.response.ok) return null;
    const payload = await response.response.json() as { session?: StudioSessionRecord };
    if (!payload.session) return null;
    setComposerValue('');
    setPendingApproval(null);
    setSidebarOpen(false);
    pushRoute(mode, payload.session.id, payload.session.projectId ?? currentProject?.id ?? null);
    return payload.session;
  }, [currentProject?.id, currentWorkspaceId, mode, pushRoute, requestedProjectId]);

  const focusSubagent = useCallback(async (subagentId: string) => {
    const target = subagents.find(item => item.id === subagentId);
    if (!target || !currentWorkspaceId) return;
    const preferredProjectId = currentProject?.id ?? requestedProjectId ?? target.projectId ?? null;
    const existing = sessions.find(item =>
      item.linkedSubagentId === subagentId
      && (!preferredProjectId || item.projectId === preferredProjectId),
    ) ?? sessions.find(item => item.linkedSubagentId === subagentId);

    if (existing) {
      pushRoute(mode, existing.id, existing.projectId ?? currentProject?.id ?? null);
      setSidebarOpen(false);
      return;
    }

    await createSession({
      linkedSubagentId: subagentId,
      title: `${target.name} session`,
    });
  }, [createSession, currentProject?.id, currentWorkspaceId, mode, pushRoute, requestedProjectId, sessions, subagents]);

  const createSubagent = useCallback(async (input: {
    name: string;
    description?: string;
    visibility?: 'private' | 'workspace' | 'public';
    exposedCapabilities?: string[];
  }) => {
    if (!currentWorkspaceId) return null;
    const response = await fetchWithBrowserSession('/api/subagents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: currentWorkspaceId,
        projectId: currentProject?.id ?? requestedProjectId,
        name: input.name,
        description: input.description ?? '',
        visibility: input.visibility ?? 'private',
        exposedCapabilities: input.exposedCapabilities ?? [],
      }),
    });
    if (!response.response.ok) return null;
    const payload = await response.response.json() as { subagent?: SubagentRecord };
    if (!payload.subagent) return null;
    const created = payload.subagent;
    setSubagents(current => [created, ...current.filter(item => item.id !== created.id)]);
    return created;
  }, [currentProject?.id, currentWorkspaceId, requestedProjectId]);

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    const response = await fetchWithBrowserSession(`/api/studio/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: nextTitle }),
    });
    if (!response.response.ok) return;
    setSessions(current => current.map(item => item.id === sessionId ? { ...item, title: nextTitle } : item));
    setSession(current => current && current.id === sessionId ? { ...current, title: nextTitle } : current);
  }, []);

  const pinSession = useCallback(async (sessionId: string, pinned: boolean) => {
    const response = await fetchWithBrowserSession(`/api/studio/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned }),
    });
    if (!response.response.ok) return;
    const now = pinned ? new Date().toISOString() : null;
    setSessions(current => current.map(item => item.id === sessionId ? { ...item, pinnedAt: now } : item));
    setSession(current => current && current.id === sessionId ? { ...current, pinnedAt: now } : current);
    await refresh();
  }, [refresh]);

  const archiveSession = useCallback(async (sessionId: string) => {
    const response = await fetchWithBrowserSession(`/api/studio/sessions/${sessionId}?mode=archive`, {
      method: 'DELETE',
    });
    if (!response.response.ok) return;
    if (session?.id === sessionId) {
      pushRoute(mode, null, currentProject?.id ?? null);
    }
    await refresh();
  }, [currentProject?.id, mode, pushRoute, refresh, session?.id]);

  const deleteSession = useCallback(async (sessionId: string) => {
    const response = await fetchWithBrowserSession(`/api/studio/sessions/${sessionId}?mode=delete`, {
      method: 'DELETE',
    });
    if (!response.response.ok) return;
    if (session?.id === sessionId) {
      pushRoute(mode, null, currentProject?.id ?? null);
    }
    await refresh();
  }, [currentProject?.id, mode, pushRoute, refresh, session?.id]);

  const selectSession = useCallback((sessionId: string) => {
    pushRoute(mode, sessionId, currentProject?.id ?? null);
    setSidebarOpen(false);
  }, [currentProject?.id, mode, pushRoute]);

  const selectProject = useCallback((projectId: string) => {
    pushRoute(mode, session?.id ?? requestedSessionId, projectId);
    setSidebarOpen(false);
  }, [mode, pushRoute, requestedSessionId, session?.id]);

  const sendMessage = useCallback(async (message?: string) => {
    const nextMessage = (message ?? composerValue).trim();
    if (!nextMessage || sending) return;
    let activeSession = session;
    let createdSession: StudioSessionRecord | null = null;
    if (!activeSession) {
      if (currentWorkspaceId) {
        const response = await fetchWithBrowserSession('/api/studio/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId: currentWorkspaceId,
            projectId: currentProject?.id ?? requestedProjectId,
            title: nextMessage.slice(0, 80) || 'New chat',
          }),
        });
        if (response.response.ok) {
          const payload = await response.response.json() as { session?: StudioSessionRecord };
          activeSession = payload.session ?? null;
          createdSession = activeSession;
          if (activeSession) {
            setSession(activeSession);
            setSessions(current => [activeSession as StudioSessionRecord, ...current.filter(item => item.id !== activeSession?.id)]);
          }
        }
      }
    }
    if (!activeSession) {
      setMessages(current => [...current, {
        id: `session-error-${Date.now()}`,
        role: 'assistant',
        content: 'I could not create a chat session. Sign in again or check workspace access.',
        createdAt: new Date().toISOString(),
      }]);
      return;
    }
    const executionSession = activeSession;
    setSending(true);
    setPendingApproval(null);
    const assistantMessageId = `streaming-assistant-${Date.now()}`;
    const abortController = new AbortController();
    streamAbortRef.current = abortController;
    activeStreamExecutionIdRef.current = null;
    setMessages(current => [...current, {
      id: `optimistic-user-${Date.now()}`,
      role: 'user',
      content: nextMessage,
      createdAt: new Date().toISOString(),
    }]);
    setComposerValue('');

    async function runNonStreamingFallback() {
      const fallback = await fetchWithBrowserSession('/api/studio/intent/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: nextMessage,
          sessionId: executionSession.id,
          workspaceId: executionSession.workspaceId,
          projectId: currentProject?.id,
        }),
      });
      const payload = parseStudioStreamPayload(await fallback.response.text());
      const reply = typeof payload.reply === 'string'
        ? payload.reply
        : fallback.response.ok
          ? 'Done.'
          : 'I could not complete that request. Try again or inspect Recovery.';
      setMessages(current => [...current, {
        id: assistantMessageId,
        role: 'assistant',
        content: reply,
        createdAt: new Date().toISOString(),
      }]);
      if (typeof payload.confirmToken === 'string') {
        setPendingApproval({ confirmToken: payload.confirmToken, reply });
      }
      if (typeof payload.navigateTo === 'string') {
        router.push(payload.navigateTo);
      }
    }

    try {
      await runNonStreamingFallback();
    } catch (error) {
      const stopped = error instanceof DOMException && error.name === 'AbortError';
      setMessages(current => [...current, {
        id: assistantMessageId,
        role: 'assistant',
        content: stopped ? 'Stopped.' : 'I could not complete that request. Try again or inspect Recovery.',
        createdAt: new Date().toISOString(),
      }]);
    } finally {
      streamAbortRef.current = null;
      activeStreamExecutionIdRef.current = null;
      setSending(false);
      if (createdSession) {
        pushRoute(mode, createdSession.id, createdSession.projectId ?? currentProject?.id ?? null);
        await refreshRuntimeState();
        return;
      }
      await refresh();
      await refreshRuntimeState();
    }
  }, [composerValue, currentProject?.id, currentWorkspaceId, mode, pushRoute, refresh, refreshRuntimeState, requestedProjectId, router, sending, session]);

  const stopGeneration = useCallback(async () => {
    streamAbortRef.current?.abort();
    const executionId = activeStreamExecutionIdRef.current;
    if (executionId) {
      await fetchWithBrowserSession(`/api/executions/${executionId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      }).catch(() => undefined);
      await refreshRuntimeState();
    }
    setSending(false);
  }, [refreshRuntimeState]);

  const approvePending = useCallback(async () => {
    if (!pendingApproval || !session) return;
    setSending(true);
    const response = await fetchWithBrowserSession('/api/studio/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        approval: true,
        confirmToken: pendingApproval.confirmToken,
        sessionId: session.id,
      }),
    });
    const payload = await response.response.json().catch(() => ({})) as Record<string, unknown>;
    const reply = typeof payload.reply === 'string' ? payload.reply : null;
    if (reply) {
      setMessages(current => [...current, {
        id: `approval-assistant-${Date.now()}`,
        role: 'assistant',
        content: reply,
        createdAt: new Date().toISOString(),
      }]);
    }
    if (typeof payload.navigateTo === 'string') {
      router.push(payload.navigateTo);
    }
    setPendingApproval(null);
    await refresh();
    await refreshRuntimeState();
    setSending(false);
  }, [pendingApproval, refresh, refreshRuntimeState, router, session]);

  async function openFile(path: string) {
    const existing = tabs.find(tab => tab.path === path);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    if (!currentProject?.id) return;
    const response = await fetchWithBrowserSession(`/api/studio/projects/${currentProject.id}/file?path=${encodeURIComponent(path)}`, {
      cache: 'no-store',
    });
    if (!response.response.ok) return;
    const payload = await response.response.json() as {
      path: string;
      content: string;
      encoding: 'utf8' | 'base64';
      contentType: string;
    };
    const tab: StudioEditorTab = {
      id: `${payload.path}:${Date.now()}`,
      path: payload.path,
      name: payload.path.split('/').pop() ?? payload.path,
      content: payload.content,
      encoding: payload.encoding,
      contentType: payload.contentType,
      dirty: false,
      readonly: payload.encoding === 'base64',
    };
    setTabs(current => [...current, tab]);
    setActiveTabId(tab.id);
  }

  const updateTabContent = useCallback((tabId: string, content: string) => {
    setTabs(current => current.map(tab => tab.id === tabId ? { ...tab, content, dirty: true } : tab));
  }, []);

  const saveActiveTab = useCallback(async () => {
    const tab = tabs.find(item => item.id === activeTabId);
    if (!tab || !currentProject?.id || tab.readonly) return;
    await fetchWithBrowserSession(`/api/studio/projects/${currentProject.id}/file`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: tab.path,
        content: tab.content,
        encoding: tab.encoding,
        contentType: tab.contentType,
      }),
    });
    setTabs(current => current.map(item => item.id === tab.id ? { ...item, dirty: false } : item));
    await refreshFiles();
  }, [activeTabId, currentProject?.id, refreshFiles, tabs]);

  const enableAdvancedMode = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(advancedKey, JSON.stringify(createStudioAdvancedSession()));
    setAdvancedMode(true);
  }, [advancedKey]);

  const startTerminal = useCallback(async () => {
    if (!currentProject?.id || terminal) return;
    const response = await fetchWithBrowserSession('/api/studio/terminals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: currentProject.id,
        advancedMode,
      }),
    });
    if (!response.response.ok) return;
    const payload = await response.response.json() as { session?: StudioTerminalSession };
    if (!payload.session) return;
    setTerminal(payload.session);
    setTerminalEvents(payload.session.events ?? []);
  }, [advancedMode, currentProject?.id, terminal]);

  const sendTerminalInput = useCallback(async () => {
    if (!terminal?.id || !terminalDraft.trim()) return;
    await fetchWithBrowserSession(`/api/studio/terminals/${terminal.id}/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: terminalDraft,
        advancedMode,
      }),
    });
    setTerminalDraft('');
  }, [advancedMode, terminal?.id, terminalDraft]);

  const requestExecutionAction = useCallback(async (
    executionId: string,
    action: 'pause' | 'resume' | 'retry' | 'cancel' | 'rollback',
  ) => {
    await fetchWithBrowserSession(`/api/executions/${executionId}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    await refreshRuntimeState();
  }, [refreshRuntimeState]);

  const panicStop = useCallback(async () => {
    await fetchWithBrowserSession('/api/panic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: currentWorkspaceId,
        sessionId: session?.id ?? null,
      }),
    });
    await refreshRuntimeState();
    openContext('recovery');
  }, [currentWorkspaceId, openContext, refreshRuntimeState, session?.id]);

  const markNotification = useCallback(async (notificationId: string, status: 'read' | 'unread' | 'archived') => {
    await fetchWithBrowserSession('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationId, status }),
    });
    await refreshRuntimeState();
  }, [refreshRuntimeState]);

  const value = useMemo<StudioContextValue>(() => ({
    loading,
    sending,
    browserSession,
    mode,
    setMode,
    sidebarOpen,
    setSidebarOpen,
    contextOpen,
    openContext,
    closeContext,
    contextSection,
    session,
    sessions,
    lineage,
    messages,
    events,
    workspaces,
    projects,
    currentProject,
    workflows,
    vaultSecrets,
    installedSkills,
    installedApps,
    superAgent,
    subagents,
    activeSubagent,
    memoryEntries,
    fileEntries,
    executions,
    recoveryExecutions,
    notifications,
    fileTree,
    tabs,
    activeTabId,
    setActiveTabId,
    terminal,
    terminalEvents,
    terminalDraft,
    setTerminalDraft,
    advancedMode,
    enableAdvancedMode,
    pendingApproval,
    setComposerValue,
    composerValue,
    sendMessage,
    stopGeneration,
    approvePending,
    createSession,
    focusSubagent,
    createSubagent,
    renameSession,
    pinSession,
    archiveSession,
    deleteSession,
    selectSession,
    selectProject,
    openFile,
    updateTabContent,
    saveActiveTab,
    refreshFiles,
    startTerminal,
    sendTerminalInput,
    panicStop,
    requestExecutionAction,
    markNotification,
    refresh,
  }), [
    activeTabId,
    activeSubagent,
    advancedMode,
    browserSession,
    closeContext,
    composerValue,
    contextOpen,
    contextSection,
    currentProject,
    enableAdvancedMode,
    events,
    executions,
    fileTree,
    fileEntries,
    installedApps,
    installedSkills,
    lineage,
    loading,
    memoryEntries,
    messages,
    mode,
    openContext,
    pendingApproval,
    notifications,
    projects,
    recoveryExecutions,
    refresh,
    refreshFiles,
    saveActiveTab,
    selectProject,
    selectSession,
    sendMessage,
    stopGeneration,
    sending,
    session,
    sessions,
    focusSubagent,
    createSubagent,
    setMode,
    sidebarOpen,
    subagents,
    superAgent,
    tabs,
    terminal,
    terminalDraft,
    terminalEvents,
    vaultSecrets,
    workflows,
    workspaces,
    createSession,
    renameSession,
    pinSession,
    archiveSession,
    deleteSession,
    approvePending,
    startTerminal,
    sendTerminalInput,
    panicStop,
    requestExecutionAction,
    markNotification,
    openFile,
    updateTabContent,
  ]);

  return <StudioContext.Provider value={value}>{props.children}</StudioContext.Provider>;
}

export function useStudio(): StudioContextValue {
  const context = useContext(StudioContext);
  if (!context) {
    throw new Error('useStudio must be used inside StudioProvider');
  }
  return context;
}
