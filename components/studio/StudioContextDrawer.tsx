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

function summarizeEventPayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return typeof payload === 'string' && payload.trim() ? payload.trim().slice(0, 160) : 'Event recorded.';
  }

  const record = payload as Record<string, unknown>;
  const redacted = new Set(['secret', 'token', 'password', 'authorization', 'apiKey', 'api_key']);
  const parts = ['title', 'message', 'intent', 'action', 'status', 'sourceType', 'executionId', 'error']
    .flatMap(key => {
      if (redacted.has(key)) return [];
      const value = record[key];
      if (value === null || value === undefined) return [];
      if (!['string', 'number', 'boolean'].includes(typeof value)) return [];
      return [`${key}: ${String(value).slice(0, 96)}`];
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
        body: `${item.namespaceType}${item.namespaceId ? `:${item.namespaceId}` : ''} | ${item.visibility} | ${item.content}`,
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
        {(['apps', 'skills', 'subagents', 'workflows', 'memory', 'files', 'vault', 'logs', 'recovery', 'notifications'] as const).map(section => (
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
        ...terminalEvents.slice(-8).map(item => ({ id: `terminal-${item.id}`, title: item.type, body: `${item.chunk ?? item.message ?? ''}${item.status ? ` | ${item.status}` : ''}` })),
      ]} /> : null}
      {contextSection === 'memory' ? (
        <div style={{ display: 'grid', gap: 18 }}>
          <button type="button" onClick={() => void exportMemory()} style={{ justifySelf: 'start', minHeight: 36, padding: '0 12px', borderRadius: 12, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.04)', color: 'inherit', cursor: 'pointer' }}>Export memory</button>
          {memoryGroups.length > 0 ? memoryGroups.map(group => (
            <SectionList key={group.key} title={group.title} items={group.items} />
          )) : <SectionList title="Memory" items={[]} />}
        </div>
      ) : null}
    </Drawer>
  );
}
