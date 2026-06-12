'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Input, StatusPill } from '@/components/os/ui';
import { useStudio } from '@/components/studio/StudioProvider';

type ChatSearchMatch = {
  messageId: string;
  sessionId: string;
  sessionTitle: string;
  snippet: string;
  timestamp: string;
};

function formatActivity(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Unknown activity';
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export default function StudioSidebar() {
  const {
    sessions,
    projects,
    session,
    currentProject,
    subagents,
    activeSubagent,
    memoryEntries,
    executions,
    selectSession,
    selectProject,
    renameSession,
    archiveSession,
    openContext,
    focusSubagent,
    createSubagent,
    createSession,
    pinSession,
    deleteSession,
  } = useStudio();
  const [query, setQuery] = useState('');
  const [chatMatches, setChatMatches] = useState<ChatSearchMatch[]>([]);
  const [searchingChats, setSearchingChats] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftCapabilities, setDraftCapabilities] = useState('');
  const [creatingAgent, setCreatingAgent] = useState(false);

  const subagentNameById = useMemo(
    () => new Map(subagents.map(item => [item.id, item.name])),
    [subagents],
  );

  const memoryCountBySubagent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of memoryEntries) {
      if (item.namespaceType !== 'subagent' || !item.namespaceId) continue;
      counts.set(item.namespaceId, (counts.get(item.namespaceId) ?? 0) + 1);
    }
    return counts;
  }, [memoryEntries]);

  const runtimeCountBySubagent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of sessions) {
      if (!item.linkedSubagentId) continue;
      counts.set(item.linkedSubagentId, (counts.get(item.linkedSubagentId) ?? 0) + 1);
    }
    return counts;
  }, [sessions]);

  const filteredSubagents = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return subagents;
    return subagents.filter(item =>
      item.name.toLowerCase().includes(normalized)
      || (item.description ?? '').toLowerCase().includes(normalized)
      || item.visibility.toLowerCase().includes(normalized)
      || item.exposedCapabilities.some(capability => capability.toLowerCase().includes(normalized)),
    );
  }, [query, subagents]);

  const filteredSessions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return sessions;
    return sessions.filter(item =>
      item.title.toLowerCase().includes(normalized)
      || (item.linkedSubagentId ? (subagentNameById.get(item.linkedSubagentId) ?? '').toLowerCase().includes(normalized) : false),
    );
  }, [query, sessions, subagentNameById]);

  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return projects;
    return projects.filter(item =>
      item.name.toLowerCase().includes(normalized)
      || (item.description ?? '').toLowerCase().includes(normalized),
    );
  }, [projects, query]);

  useEffect(() => {
    let active = true;
    if (query.trim().length < 2) {
      setChatMatches([]);
      setSearchingChats(false);
      return () => { active = false; };
    }

    setSearchingChats(true);
    void fetch(`/api/search/chats?q=${encodeURIComponent(query.trim())}&scope=all${session?.id ? `&sessionId=${encodeURIComponent(session.id)}` : ''}`, {
      cache: 'no-store',
    })
      .then(async response => response.ok ? response.json() : { matches: [] })
      .then(payload => {
        if (!active) return;
        setChatMatches(Array.isArray(payload.matches) ? payload.matches.slice(0, 6) : []);
      })
      .catch(() => {
        if (!active) return;
        setChatMatches([]);
      })
      .finally(() => {
        if (active) setSearchingChats(false);
      });

    return () => {
      active = false;
    };
  }, [query, session?.id]);

  async function handleCreateAgent() {
    const name = draftName.trim();
    if (!name) return;
    setCreatingAgent(true);
    const subagent = await createSubagent({
      name,
      description: draftDescription.trim() || undefined,
      visibility: 'private',
      exposedCapabilities: draftCapabilities
        .split(',')
        .map(item => item.trim())
        .filter(Boolean),
    });
    if (subagent) {
      setDraftName('');
      setDraftDescription('');
      setDraftCapabilities('');
      await focusSubagent(subagent.id);
    }
    setCreatingAgent(false);
  }

  return (
    <div style={{ display: 'grid', gap: 22, padding: 20 }}>
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Agent search</div>
        <Input placeholder="Search agents, chats, projects" value={query} onChange={event => setQuery(event.target.value)} />
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Running</div>
          <Badge tone="accent">{executions.filter(item => ['queued', 'running', 'waiting_for_user', 'paused'].includes(item.status)).length}</Badge>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {executions.filter(item => ['queued', 'running', 'waiting_for_user', 'paused'].includes(item.status)).slice(0, 4).map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => openContext('recovery')}
              style={{
                textAlign: 'left',
                padding: '12px 14px',
                borderRadius: 16,
                border: '1px solid var(--border)',
                background: 'rgba(255,255,255,0.02)',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 600 }}>{item.title}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{item.sourceType} | {item.status}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Active context</div>
        <div style={{ padding: '14px 16px', borderRadius: 18, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.03)', display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <strong>{activeSubagent?.name ?? 'Super AgentOS'}</strong>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Badge tone={activeSubagent ? 'accent' : 'success'}>{activeSubagent ? 'Linked agent' : 'Primary agent'}</Badge>
              {session ? <StatusPill status={session.visibility} /> : null}
            </div>
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            {activeSubagent?.description ?? 'General-purpose Studio session with shared AgentOS context.'}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {currentProject ? <Badge tone="default">{currentProject.name}</Badge> : null}
            {activeSubagent?.status ? <StatusPill status={activeSubagent.status} /> : null}
            {activeSubagent?.visibility ? <Badge tone="default">{activeSubagent.visibility}</Badge> : null}
          </div>
          <div className="os-inline-actions">
            <Button variant="secondary" onClick={() => void createSession()}>New general chat</Button>
            <Button variant="secondary" onClick={() => openContext('subagents')}>Agent panel</Button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Agents</div>
          <Badge tone="accent">{subagents.length}</Badge>
        </div>
        <div style={{ padding: '14px 16px', borderRadius: 18, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.03)', display: 'grid', gap: 10 }}>
          <Input placeholder="New agent name" value={draftName} onChange={event => setDraftName(event.target.value)} />
          <Input placeholder="What this agent does" value={draftDescription} onChange={event => setDraftDescription(event.target.value)} />
          <Input placeholder="Capabilities, comma-separated" value={draftCapabilities} onChange={event => setDraftCapabilities(event.target.value)} />
          <Button onClick={() => void handleCreateAgent()} disabled={creatingAgent || !draftName.trim()}>{creatingAgent ? 'Creating...' : '+ New agent'}</Button>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {filteredSubagents.slice(0, 8).map(item => {
            const isActive = activeSubagent?.id === item.id;
            const memoryCount = memoryCountBySubagent.get(item.id) ?? 0;
            const runtimeCount = runtimeCountBySubagent.get(item.id) ?? 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => void focusSubagent(item.id)}
                style={{
                  textAlign: 'left',
                  padding: '14px 16px',
                  borderRadius: 18,
                  border: '1px solid var(--border)',
                  background: isActive ? 'rgba(20, 184, 166, 0.12)' : 'rgba(255,255,255,0.02)',
                  color: 'inherit',
                  cursor: 'pointer',
                  display: 'grid',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{item.name}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{item.description ?? 'No description yet.'}</div>
                  </div>
                  {isActive ? <Badge tone="accent">Active</Badge> : null}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <StatusPill status={item.status} />
                  <Badge tone="default">{item.visibility}</Badge>
                  <Badge tone="default">{memoryCount} memory</Badge>
                  <Badge tone="default">{runtimeCount} runtime</Badge>
                  <Badge tone="default">{formatActivity(item.updatedAt)}</Badge>
                </div>
                {item.exposedCapabilities.length > 0 ? (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {item.exposedCapabilities.slice(0, 4).map(capability => <Badge key={capability} tone="accent">{capability}</Badge>)}
                  </div>
                ) : null}
              </button>
            );
          })}
          {filteredSubagents.length === 0 ? (
            <div style={{ padding: '12px 14px', borderRadius: 16, border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              No agents match your search.
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Chats</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {filteredSessions.slice(0, 8).map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => selectSession(item.id)}
              style={{
                textAlign: 'left',
                padding: '12px 14px',
                borderRadius: 16,
                border: '1px solid var(--border)',
                background: item.id === session?.id ? 'rgba(103, 232, 249, 0.12)' : 'rgba(255,255,255,0.02)',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{item.title}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                    {item.linkedSubagentId ? `${subagentNameById.get(item.linkedSubagentId) ?? 'Agent'} chat` : 'General chat'}
                  </div>
                  <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{formatActivity(item.updatedAt)}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={async event => {
                      event.stopPropagation();
                      const nextTitle = window.prompt('Rename chat', item.title);
                      if (!nextTitle || nextTitle.trim() === item.title) return;
                      await renameSession(item.id, nextTitle);
                    }}
                    style={{
                      minHeight: 28,
                      padding: '0 8px',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      background: 'rgba(255,255,255,0.04)',
                      color: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={async event => {
                      event.stopPropagation();
                      await pinSession(item.id, !item.pinnedAt);
                    }}
                    style={{
                      minHeight: 28,
                      padding: '0 8px',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      background: item.pinnedAt ? 'rgba(20, 184, 166, 0.14)' : 'rgba(255,255,255,0.04)',
                      color: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    {item.pinnedAt ? 'Unpin' : 'Pin'}
                  </button>
                  <button
                    type="button"
                    onClick={async event => {
                      event.stopPropagation();
                      const confirmed = window.confirm(`Archive "${item.title}"?`);
                      if (!confirmed) return;
                      await archiveSession(item.id);
                    }}
                    style={{
                      minHeight: 28,
                      padding: '0 8px',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      background: 'rgba(255,255,255,0.04)',
                      color: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    Archive
                  </button>
                  <button
                    type="button"
                    onClick={async event => {
                      event.stopPropagation();
                      const confirmed = window.confirm(`Delete "${item.title}"?`);
                      if (!confirmed) return;
                      await deleteSession(item.id);
                    }}
                    style={{
                      minHeight: 28,
                      padding: '0 8px',
                      borderRadius: 10,
                      border: '1px solid rgba(248, 113, 113, 0.35)',
                      background: 'rgba(248, 113, 113, 0.08)',
                      color: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </button>
          ))}
          {filteredSessions.length === 0 ? (
            <div style={{ padding: '12px 14px', borderRadius: 16, border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              No chats match your search.
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Projects</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {filteredProjects.slice(0, 8).map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => selectProject(item.id)}
              style={{
                textAlign: 'left',
                padding: '12px 14px',
                borderRadius: 16,
                border: '1px solid var(--border)',
                background: item.id === currentProject?.id ? 'rgba(20, 184, 166, 0.12)' : 'rgba(255,255,255,0.02)',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 600 }}>{item.name}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{item.description ?? item.status}</div>
            </button>
          ))}
          {filteredProjects.length === 0 ? (
            <div style={{ padding: '12px 14px', borderRadius: 16, border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              No projects match your search.
            </div>
          ) : null}
        </div>
      </div>

      {query.trim().length >= 2 ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Chat search</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {chatMatches.map(item => (
              <button
                key={`${item.sessionId}:${item.messageId}`}
                type="button"
                onClick={() => selectSession(item.sessionId)}
                style={{
                  textAlign: 'left',
                  padding: '12px 14px',
                  borderRadius: 16,
                  border: '1px solid var(--border)',
                  background: 'rgba(255,255,255,0.02)',
                  color: 'inherit',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={{ fontWeight: 600 }}>{item.sessionTitle}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>{item.snippet}</div>
                </div>
              </button>
            ))}
            {!searchingChats && chatMatches.length === 0 ? (
              <div style={{ padding: '12px 14px', borderRadius: 16, border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                No chat matches.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: 8 }}>
        {[
          ['Agents', 'subagents'],
          ['Workflows', 'workflows'],
          ['Memory', 'memory'],
          ['Files', 'files'],
          ['Vault', 'vault'],
          ['Runtime', 'logs'],
          ['Recovery', 'recovery'],
          ['Notifications', 'notifications'],
        ].map(([label, section]) => (
          <button
            key={label}
            type="button"
            onClick={() => openContext(section as 'subagents' | 'workflows' | 'memory' | 'files' | 'vault' | 'logs' | 'recovery' | 'notifications')}
            style={{
              minHeight: 44,
              padding: '0 14px',
              borderRadius: 14,
              border: '1px solid var(--border)',
              background: 'rgba(255,255,255,0.02)',
              textAlign: 'left',
              color: 'inherit',
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
