'use client';

import { Drawer } from '@/components/os/overlays';
import { Badge, StatusPill } from '@/components/os/ui';
import { useStudio } from '@/components/studio/StudioProvider';
import { fetchWithBrowserSession } from '@/src/auth/browser-session';

function SectionList(props: { title: string; items: Array<{ id: string; title: string; body: string }> }) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <strong>{props.title}</strong>
      {props.items.length > 0 ? props.items.map(item => (
        <div key={item.id} style={{ padding: '14px 16px', borderRadius: 16, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.03)' }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{item.title}</div>
          <div style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>{item.body}</div>
        </div>
      )) : <span style={{ color: 'var(--text-secondary)' }}>Nothing here yet.</span>}
    </div>
  );
}

type ContextOverviewItem = {
  id: string;
  title: string;
  body: string;
  badges?: string[];
  action?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    title?: string;
  };
};

function ContextSourceGroup(props: {
  title: string;
  description: string;
  items: ContextOverviewItem[];
}) {
  return (
    <section className="studio-context-source-group">
      <div>
        <strong>{props.title}</strong>
        <p>{props.description}</p>
      </div>
      {props.items.length > 0 ? props.items.map(item => (
        <div key={item.id} className="studio-context-source-item">
          <div>
            <div style={{ fontWeight: 650 }}>{item.title}</div>
            <div style={{ color: 'var(--text-secondary)', lineHeight: 1.55 }}>{item.body}</div>
          </div>
          <div className="studio-context-source-side">
            {item.badges?.length ? (
              <div className="studio-context-source-badges">
                {item.badges.map(badge => <Badge key={badge} tone="default">{badge}</Badge>)}
              </div>
            ) : null}
            {item.action ? (
              <button
                type="button"
                onClick={item.action.onClick}
                disabled={item.action.disabled}
                title={item.action.title ?? item.action.label}
              >
                {item.action.label}
              </button>
            ) : null}
          </div>
        </div>
      )) : <span style={{ color: 'var(--text-secondary)' }}>Nothing attached.</span>}
    </section>
  );
}

function redactContextText(value: string): string {
  return value
    .replace(/(authorization|api[_-]?key|password|secret|token)\s*[:=]\s*[^,\s;]+/gi, '$1: [redacted]')
    .replace(/sk-[a-zA-Z0-9_-]{16,}/g, '[redacted secret]')
    .replace(/Bearer\s+[a-zA-Z0-9._-]+/g, 'Bearer [redacted]');
}

function textMentionsSecret(value: string | null | undefined): boolean {
  return Boolean(value && /\b(vault|secret|token|credential|api key|password)\b/i.test(value));
}

function summarizeEventPayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return typeof payload === 'string' && payload.trim() ? redactContextText(payload.trim()).slice(0, 160) : 'Event recorded.';
  }

  const record = payload as Record<string, unknown>;
  const redacted = new Set(['secret', 'token', 'password', 'authorization', 'apiKey', 'api_key']);
  const parts = ['title', 'message', 'intent', 'action', 'status', 'sourceType', 'executionId', 'error']
    .flatMap(key => {
      if (redacted.has(key)) return [];
      const value = record[key];
      if (value === null || value === undefined) return [];
      if (!['string', 'number', 'boolean'].includes(typeof value)) return [];
      return [`${key}: ${redactContextText(String(value)).slice(0, 96)}`];
    });

  return parts.length > 0 ? parts.join(' | ') : 'Event metadata recorded.';
}

function classifyMemoryEntry(entry: { namespaceType: string; visibility: string }): 'my' | 'agent' | 'privateSubagent' | 'workspace' | 'shared' {
  if (entry.namespaceType === 'user') return 'my';
  if (entry.namespaceType === 'agent') return 'agent';
  if (entry.namespaceType === 'subagent' && entry.visibility === 'private') return 'privateSubagent';
  if (entry.namespaceType === 'workspace' || entry.visibility === 'workspace') return 'workspace';
  return 'shared';
}

export default function StudioContextDrawer() {
  const {
    contextOpen,
    closeContext,
    contextSection,
    openContext,
    installedApps,
    installedSkills,
    subagents,
    activeSubagent,
    workflows,
    memoryEntries,
    fileEntries,
    vaultSecrets,
    session,
    currentProject,
    terminal,
    terminalEvents,
    events,
    executions,
    recoveryExecutions,
    notifications,
    requestExecutionAction,
    markNotification,
    refresh,
    lineage,
    composerAttachments,
    composerInvocations,
    removeComposerAttachment,
    removeComposerInvocation,
    pendingApproval,
  } = useStudio();

  async function previewFile(path: string) {
    const response = await fetchWithBrowserSession(`/api/files?action=preview&path=${encodeURIComponent(path)}`, { cache: 'no-store' });
    const payload = await response.response.json().catch(() => null) as { data?: string; contentEncoding?: string } | null;
    window.alert(payload?.contentEncoding === 'base64' ? 'Binary preview is available as base64.' : payload?.data?.slice(0, 2000) || 'No preview available.');
  }

  async function summarizeFile(path: string) {
    const response = await fetchWithBrowserSession(`/api/files?action=summarize&path=${encodeURIComponent(path)}`, { cache: 'no-store' });
    const payload = await response.response.json().catch(() => null) as { summary?: string } | null;
    window.alert(payload?.summary || 'No summary available.');
    await refresh();
  }

  async function renameFile(path: string) {
    const nextPath = window.prompt('Rename file', path);
    if (!nextPath || nextPath.trim() === path) return;
    await fetchWithBrowserSession('/api/files', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, nextPath }),
    });
    await refresh();
  }

  async function deleteFile(path: string) {
    if (!window.confirm(`Delete ${path}?`)) return;
    await fetchWithBrowserSession(`/api/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
    await refresh();
  }

  async function updateSessionContext(patch: Record<string, unknown>) {
    if (!session?.id) return;
    await fetchWithBrowserSession(`/api/studio/sessions/${encodeURIComponent(session.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    await refresh();
  }

  async function exportMemory() {
    const response = await fetchWithBrowserSession('/api/memory?export=1&limit=200', { cache: 'no-store' });
    const payload = await response.response.text();
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `agentos-memory-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const title = contextSection.charAt(0).toUpperCase() + contextSection.slice(1);
  const memoryGroups = [
    { key: 'my', title: 'My Memory' },
    { key: 'agent', title: 'Agent Memory' },
    { key: 'privateSubagent', title: 'Private Subagent Memory' },
    { key: 'workspace', title: 'Workspace Memory' },
    { key: 'shared', title: 'Shared Memory' },
  ].map(group => ({
    ...group,
    items: memoryEntries
      .filter(item => classifyMemoryEntry(item) === group.key)
      .map(item => ({
        id: item.id,
        title: item.key,
        body: `${item.namespaceType}${item.namespaceId ? `:${item.namespaceId}` : ''} | ${item.visibility} | ${redactContextText(item.content)}`,
      })),
  })).filter(group => group.items.length > 0);
  const summary = [
    {
      id: 'session',
      title: 'Session',
      body: session?.title ?? 'No active session',
      badges: [
        session?.visibility ?? 'private',
        currentProject?.name ?? 'No project',
      ],
    },
    {
      id: 'agent',
      title: 'Agent',
      body: activeSubagent?.description ?? 'Super AgentOS primary session',
      badges: [
        activeSubagent?.name ?? 'Super AgentOS',
        activeSubagent?.status ?? 'active',
      ],
    },
    {
      id: 'runtime',
      title: 'Runtime',
      body: terminal ? `${terminal.shell} in ${terminal.cwd}` : 'Terminal not started in this project',
      badges: [
        terminal?.status ?? 'idle',
        `${executions.length} executions`,
      ],
    },
    {
      id: 'memory',
      title: 'Memory',
      body: `${memoryEntries.length} visible memory records and ${fileEntries.length} governed files`,
      badges: [
        `${workflows.length} workflows`,
        `${notifications.filter(item => item.status === 'unread').length} alerts`,
      ],
    },
  ];
  const appName = (id: string | null | undefined) => installedApps.find(item => item.id === id || item.slug === id)?.name ?? id ?? 'Linked app';
  const workflowName = (id: string | null | undefined) => workflows.find(item => item.id === id)?.name ?? id ?? 'Linked workflow';
  const subagentName = (id: string | null | undefined) => subagents.find(item => item.id === id)?.name ?? id ?? 'Linked subagent';
  const vaultPermissionNeeded = textMentionsSecret(pendingApproval?.reply)
    || notifications.some(item => item.status === 'unread' && (textMentionsSecret(item.title) || textMentionsSecret(item.body)))
    || executions.some(item => textMentionsSecret(item.title) || textMentionsSecret(JSON.stringify(item.failure ?? {})));
  const appAndWorkflowOutputs = executions
    .filter(item => ['app', 'skill', 'workflow', 'subagent', 'mcp', 'super_agent'].some(source => item.sourceType.toLowerCase().includes(source)))
    .slice(0, 8);
  const contextOverviewGroups = [
    {
      title: 'Project Context',
      description: 'Workspace and project boundaries Super AgentOS can use for this Studio session.',
      items: [
        {
          id: 'workspace-context',
          title: 'Workspace',
          body: currentProject?.workspaceId ? `Workspace ID ${currentProject.workspaceId}` : 'Workspace comes from the active browser session.',
          badges: [currentProject ? 'active' : 'not selected'],
        },
        {
          id: 'project-context',
          title: currentProject?.name ?? 'No active project',
          body: currentProject?.description ?? 'Project context is selected from Studio and can be changed from the composer.',
          badges: [currentProject?.status ?? 'unselected'],
        },
      ],
    },
    {
      title: 'Session Context',
      description: 'Conversation state and session-scoped references currently attached to Super AgentOS.',
      items: [
        {
          id: 'session-context',
          title: session?.title ?? 'New chat',
          body: session ? `Visibility ${session.visibility}; project ${currentProject?.name ?? 'none'}.` : 'No persisted session exists until the first message is sent.',
          badges: [session?.visibility ?? 'draft'],
        },
        ...(session?.linkedSubagentId ? [{
          id: 'linked-subagent',
          title: subagentName(session.linkedSubagentId),
          body: 'Private subagent linked to this session.',
          badges: ['subagent'],
          action: {
            label: 'Detach',
            onClick: () => void updateSessionContext({ linkedSubagentId: null }),
          },
        }] : []),
        ...(session?.linkedAppId ? [{
          id: 'linked-app',
          title: appName(session.linkedAppId),
          body: 'Agentic app linked to this session.',
          badges: ['app'],
          action: {
            label: 'Detach',
            onClick: () => void updateSessionContext({ linkedAppId: null }),
          },
        }] : []),
        ...(session?.linkedWorkflowId ? [{
          id: 'linked-workflow',
          title: workflowName(session.linkedWorkflowId),
          body: 'Workflow linked to this session.',
          badges: ['workflow'],
          action: {
            label: 'Detach',
            onClick: () => void updateSessionContext({ linkedWorkflowId: null }),
          },
        }] : []),
      ],
    },
    {
      title: 'Attached Files And Assets',
      description: 'Files selected for the next request and files already visible to the current session.',
      items: [
        ...composerAttachments.map(item => ({
          id: `composer-file-${item.id}`,
          title: item.name,
          body: item.path,
          badges: ['selected file'],
          action: {
            label: 'Detach',
            onClick: () => removeComposerAttachment(item.id),
          },
        })),
        ...(session?.linkedFilePaths ?? []).map(path => ({
          id: `linked-file-${path}`,
          title: path,
          body: 'Session-linked file path. File contents are not shown in context overview.',
          badges: ['session file'],
          action: {
            label: 'Detach',
            onClick: () => void updateSessionContext({
              linkedFilePaths: (session?.linkedFilePaths ?? []).filter(item => item !== path),
            }),
          },
        })),
        ...fileEntries.slice(0, 6).map(item => ({
          id: `visible-file-${item.id}`,
          title: item.path,
          body: `${String(item.metadata.kind ?? 'file')} | ${item.visibility}`,
          badges: ['governed file'],
        })),
      ],
    },
    {
      title: 'Selected Resources',
      description: 'Apps, skills, workflows, subagents, and MCP resources selected for the next Super AgentOS request.',
      items: composerInvocations.map(item => ({
        id: `selected-${item.id}`,
        title: item.label,
        body: `${item.kind} selected in the composer.`,
        badges: [item.kind],
        action: {
          label: 'Detach',
          onClick: () => removeComposerInvocation(item.id),
        },
      })),
    },
    {
      title: 'Installed Assets',
      description: 'Installed assets Super AgentOS may route to when selected or requested.',
      items: [
        ...installedApps.slice(0, 4).map(item => ({ id: `asset-app-${item.id}`, title: item.name, body: item.description, badges: ['app'] })),
        ...installedSkills.slice(0, 4).map(item => ({ id: `asset-skill-${item.id}`, title: item.name, body: item.description, badges: ['skill'] })),
        ...workflows.slice(0, 4).map(item => ({ id: `asset-workflow-${item.id}`, title: item.name, body: item.summary ?? item.status, badges: ['workflow'] })),
        ...subagents.slice(0, 4).map(item => ({ id: `asset-subagent-${item.id}`, title: item.name, body: item.description ?? item.status, badges: ['private subagent'] })),
      ],
    },
    {
      title: 'Memory Context',
      description: 'Memory is separate from session and project context. Secrets must not become memory.',
      items: [
        ...memoryEntries.slice(0, 8).map(item => ({
          id: `memory-${item.id}`,
          title: item.key,
          body: `${item.namespaceType}${item.namespaceId ? `:${item.namespaceId}` : ''} | ${item.visibility} | ${redactContextText(item.content)}`,
          badges: [classifyMemoryEntry(item)],
          action: (session?.linkedMemoryRefs ?? []).includes(item.id) ? {
            label: 'Detach',
            onClick: () => void updateSessionContext({
              linkedMemoryRefs: (session?.linkedMemoryRefs ?? []).filter(ref => ref !== item.id),
            }),
          } : undefined,
        })),
        ...(session?.linkedMemoryRefs ?? [])
          .filter(ref => !memoryEntries.some(item => item.id === ref))
          .map(ref => ({
            id: `memory-ref-${ref}`,
            title: ref,
            body: 'Session-linked memory reference. Content is unavailable in this context view.',
            badges: ['memory reference'],
            action: {
              label: 'Detach',
              onClick: () => void updateSessionContext({
                linkedMemoryRefs: (session?.linkedMemoryRefs ?? []).filter(item => item !== ref),
              }),
            },
          })),
      ],
    },
    {
      title: 'Workflow Logs And App Outputs',
      description: 'Execution records are summarized without raw outputs, stack traces, or secret payloads.',
      items: [
        ...events.slice(-4).map(item => ({ id: `overview-event-${item.id}`, title: item.type, body: summarizeEventPayload(item.payload), badges: ['event'] })),
        ...appAndWorkflowOutputs.map(item => ({
          id: `overview-execution-${item.id}`,
          title: item.title,
          body: `${item.sourceType} | ${item.status}`,
          badges: ['execution'],
        })),
      ],
    },
    {
      title: 'Vault Permission State',
      description: 'Vault exposes secret names and permission state only. Secret values never appear as normal context.',
      items: [
        {
          id: 'vault-permission-needed',
          title: vaultPermissionNeeded ? 'Vault permission needed now' : 'No Vault permission requested',
          body: vaultPermissionNeeded
            ? 'A pending approval, notification, or execution indicates secret access may be required.'
            : 'Super AgentOS will ask before using a secret.',
          badges: [vaultPermissionNeeded ? 'permission needed' : 'idle'],
        },
        ...vaultSecrets.map(item => ({
          id: `vault-secret-${item.id}`,
          title: item.name,
          body: `Secret value hidden. Status: ${item.status}.`,
          badges: ['metadata only'],
        })),
      ],
    },
  ];

  return (
    <Drawer
      open={contextOpen}
      onClose={closeContext}
      title={title}
      description="Shared Studio context"
      placement="right"
      mobilePlacement="bottom"
      size="md"
    >
      <div style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
        {summary.map(item => (
          <div key={item.id} style={{ padding: '14px 16px', borderRadius: 16, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.03)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
              <strong>{item.title}</strong>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {item.badges.map(badge => badge ? <Badge key={badge} tone="default">{badge}</Badge> : null)}
              </div>
            </div>
            <div style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>{item.body}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {(['overview', 'apps', 'skills', 'subagents', 'workflows', 'memory', 'files', 'vault', 'logs', 'recovery', 'notifications'] as const).map(section => (
          <button
            key={section}
            type="button"
            onClick={() => openContext(section)}
            style={{
              minHeight: 34,
              padding: '0 12px',
              borderRadius: 999,
              border: '1px solid var(--border)',
              background: contextSection === section ? 'rgba(20,184,166,0.16)' : 'rgba(255,255,255,0.03)',
              color: 'inherit',
              cursor: 'pointer',
            }}
          >
            {section}
          </button>
        ))}
      </div>

      {contextSection === 'overview' ? (
        <div className="studio-context-overview">
          {contextOverviewGroups.map(group => (
            <ContextSourceGroup
              key={group.title}
              title={group.title}
              description={group.description}
              items={group.items}
            />
          ))}
        </div>
      ) : null}
      {contextSection === 'apps' ? <SectionList title="Installed Apps" items={installedApps.map(item => ({ id: item.id, title: item.name, body: item.description }))} /> : null}
      {contextSection === 'skills' ? <SectionList title="Installed Skills" items={installedSkills.map(item => ({ id: item.id, title: item.name, body: item.description }))} /> : null}
      {contextSection === 'subagents' ? <SectionList title="Subagents" items={subagents.map(item => ({
        id: item.id,
        title: item.name,
        body: `${item.status} | ${item.visibility} access${item.exposedCapabilities.length > 0 ? ` | ${item.exposedCapabilities.join(', ')}` : ''}${item.description ? ` | ${item.description}` : ''}`,
      }))} /> : null}
      {contextSection === 'workflows' ? <SectionList title="Workflows" items={workflows.map(item => ({ id: item.id, title: item.name, body: item.summary ?? item.status }))} /> : null}
      {contextSection === 'vault' ? <SectionList title="Vault" items={vaultSecrets.map(item => ({ id: item.id, title: item.name, body: item.status }))} /> : null}
      {contextSection === 'files' ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <strong>Files and Artifacts</strong>
          {fileEntries.length > 0 ? fileEntries.map(item => (
            <div key={item.id} style={{ padding: '14px 16px', borderRadius: 16, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.03)', display: 'grid', gap: 8 }}>
              <div style={{ fontWeight: 600 }}>{item.path}</div>
              <div style={{ color: 'var(--text-secondary)' }}>{String(item.metadata.kind ?? 'file')} | {item.visibility}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => void previewFile(item.path)} style={{ minHeight: 32, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.04)', color: 'inherit', cursor: 'pointer' }}>Preview</button>
                <button type="button" onClick={() => void summarizeFile(item.path)} style={{ minHeight: 32, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.04)', color: 'inherit', cursor: 'pointer' }}>Summarize</button>
                <button type="button" onClick={() => void renameFile(item.path)} style={{ minHeight: 32, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.04)', color: 'inherit', cursor: 'pointer' }}>Rename</button>
                <button type="button" onClick={() => void deleteFile(item.path)} style={{ minHeight: 32, padding: '0 10px', borderRadius: 10, border: '1px solid rgba(248,113,113,0.35)', background: 'rgba(248,113,113,0.08)', color: 'inherit', cursor: 'pointer' }}>Delete</button>
              </div>
            </div>
          )) : <span style={{ color: 'var(--text-secondary)' }}>Nothing here yet.</span>}
        </div>
      ) : null}
      {contextSection === 'recovery' ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <strong>Recovery Center</strong>
          {recoveryExecutions.length > 0 ? recoveryExecutions.map(item => (
            <div key={item.id} style={{ padding: '14px 16px', borderRadius: 16, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.03)', display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <strong>{item.title}</strong>
                <StatusPill status={item.status} />
              </div>
              {item.failure ? (
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {String(item.failure.whatFailed ?? item.failure.why ?? 'Execution needs attention')}
                </div>
              ) : <div style={{ color: 'var(--text-secondary)' }}>{item.sourceType}</div>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(['resume', 'retry', 'cancel', 'rollback'] as const).map(action => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => void requestExecutionAction(item.id, action)}
                    style={{
                      minHeight: 34,
                      padding: '0 12px',
                      borderRadius: 12,
                      border: '1px solid var(--border)',
                      background: 'rgba(255,255,255,0.04)',
                      color: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    {action}
                  </button>
                ))}
              </div>
            </div>
          )) : <span style={{ color: 'var(--text-secondary)' }}>No recoverable executions.</span>}
        </div>
      ) : null}
      {contextSection === 'notifications' ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <strong>Notifications</strong>
          {notifications.length > 0 ? notifications.map(item => (
            <div key={item.id} style={{ padding: '14px 16px', borderRadius: 16, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.03)', display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <strong>{item.title}</strong>
                <StatusPill status={item.status} />
              </div>
              <div style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>{item.body}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => void markNotification(item.id, 'read')} style={{ minHeight: 32, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.04)', color: 'inherit', cursor: 'pointer' }}>Read</button>
                <button type="button" onClick={() => void markNotification(item.id, 'archived')} style={{ minHeight: 32, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.04)', color: 'inherit', cursor: 'pointer' }}>Archive</button>
              </div>
            </div>
          )) : <span style={{ color: 'var(--text-secondary)' }}>No notifications.</span>}
        </div>
      ) : null}
      {contextSection === 'logs' ? <SectionList title="Logs" items={[
        ...(lineage.parent ? [{ id: `parent-${lineage.parent.id}`, title: 'Parent session', body: lineage.parent.title }] : []),
        ...lineage.children.map(item => ({ id: `child-${item.id}`, title: 'Related session', body: item.title })),
        ...events.slice(-8).map(item => ({ id: `studio-${item.id}`, title: item.type, body: summarizeEventPayload(item.payload) })),
        ...executions.slice(0, 8).map(item => ({ id: `execution-${item.id}`, title: item.status, body: `${item.sourceType} | ${item.title}` })),
        ...(terminal ? [{ id: `terminal-status-${terminal.id}`, title: 'Terminal session', body: `${terminal.status} | ${terminal.cwd}` }] : []),
        ...terminalEvents.slice(-8).map(item => ({ id: `terminal-${item.id}`, title: item.type, body: redactContextText(`${item.chunk ?? item.message ?? ''}${item.status ? ` | ${item.status}` : ''}`) })),
      ]} /> : null}
      {contextSection === 'memory' ? (
        <div style={{ display: 'grid', gap: 18 }}>
          <button type="button" onClick={() => void exportMemory()} style={{ justifySelf: 'start', minHeight: 36, padding: '0 12px', borderRadius: 12, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.04)', color: 'inherit', cursor: 'pointer' }}>Export memory</button>
          {memoryGroups.length > 0 ? memoryGroups.map(group => (
            <SectionList key={group.key} title={group.title} items={group.items} />
          )) : <SectionList title="Memory" items={[]} />}
        </div>
      ) : null}
      <style>{`
        .studio-context-overview {
          display: grid;
          gap: 14px;
        }

        .studio-context-source-group {
          display: grid;
          gap: 9px;
          padding: 13px;
          border: 1px solid var(--border);
          border-radius: 14px;
          background: rgba(255,255,255,0.025);
        }

        .studio-context-source-group p {
          margin: 4px 0 0;
          color: var(--text-secondary);
          font-size: 0.78rem;
          line-height: 1.55;
        }

        .studio-context-source-item {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 10px;
          align-items: start;
          padding: 10px 11px;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: rgba(255,255,255,0.03);
        }

        .studio-context-source-side {
          display: grid;
          justify-items: end;
          gap: 7px;
        }

        .studio-context-source-badges {
          display: flex;
          justify-content: flex-end;
          gap: 5px;
          flex-wrap: wrap;
        }

        .studio-context-source-item button {
          min-height: 30px;
          padding: 0 10px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: rgba(255,255,255,0.04);
          color: var(--text-secondary);
          cursor: pointer;
        }

        .studio-context-source-item button:hover {
          color: var(--text-primary);
        }

        .studio-context-source-item button:disabled {
          opacity: 0.55;
          cursor: default;
        }

        @media (max-width: 640px) {
          .studio-context-source-item {
            grid-template-columns: minmax(0, 1fr);
          }

          .studio-context-source-side {
            justify-items: start;
          }

          .studio-context-source-badges {
            justify-content: flex-start;
          }
        }
      `}</style>
    </Drawer>
  );
}
