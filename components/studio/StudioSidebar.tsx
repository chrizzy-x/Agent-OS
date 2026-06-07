'use client';

import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/os/ui';
import { useStudio } from '@/components/studio/StudioProvider';

type ChatSearchMatch = {
  messageId: string;
  sessionId: string;
  sessionTitle: string;
  snippet: string;
  timestamp: string;
};

export default function StudioSidebar() {
  const {
    sessions,
    projects,
    session,
    currentProject,
    selectSession,
    selectProject,
    renameSession,
    archiveSession,
    openContext,
  } = useStudio();
  const [query, setQuery] = useState('');
  const [chatMatches, setChatMatches] = useState<ChatSearchMatch[]>([]);
  const [searchingChats, setSearchingChats] = useState(false);

  const filteredSessions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return sessions;
    return sessions.filter(item => item.title.toLowerCase().includes(normalized));
  }, [query, sessions]);

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

  return (
    <div style={{ display: 'grid', gap: 22, padding: 20 }}>
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Search</div>
        <Input placeholder="Search chats and projects" value={query} onChange={event => setQuery(event.target.value)} />
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
                background: item.id === session?.id ? 'rgba(20, 184, 166, 0.12)' : 'rgba(255,255,255,0.02)',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{item.title}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{new Date(item.updatedAt).toLocaleDateString()}</div>
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
                      const confirmed = window.confirm(`Delete "${item.title}"? This archives the chat and removes it from active lists.`);
                      if (!confirmed) return;
                      await archiveSession(item.id);
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
                background: item.id === currentProject?.id ? 'rgba(103, 232, 249, 0.12)' : 'rgba(255,255,255,0.02)',
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
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Chat Search</div>
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
          ['Apps', 'apps'],
          ['Skills', 'skills'],
          ['Subagents', 'subagents'],
          ['Files', 'files'],
          ['Recent', 'logs'],
        ].map(([label, section]) => (
          <button
            key={label}
            type="button"
            onClick={() => openContext(section as 'apps' | 'skills' | 'subagents' | 'files' | 'logs')}
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
