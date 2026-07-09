'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { fetchWithBrowserSession } from '@/src/auth/browser-session';
import { useStudio } from '@/components/studio/StudioProvider';
import { buildStudioRoute, STUDIO_MODES } from '@/src/studio/modes';

type ChatSearchMatch = {
  messageId: string;
  sessionId: string;
  sessionTitle: string;
  snippet: string;
};

type SessionListItem = ReturnType<typeof useStudio>['sessions'][number];

export default function StudioSidebar() {
  const {
    sessions,
    session,
    projects,
    selectSession,
    startNewChat,
    currentProject,
    mode,
    setMode,
    renameSession,
    attachSessionToProject,
    pinSession,
    archiveSession,
    deleteSession,
  } = useStudio();
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ChatSearchMatch[]>([]);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [projectMenuSessionId, setProjectMenuSessionId] = useState<string | null>(null);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const recentSessions = sessions
    .filter(item => !item.archivedAt && !item.deletedAt)
    .sort((left, right) => Number(Boolean(right.pinnedAt)) - Number(Boolean(left.pinnedAt))
      || right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 12);

  async function searchChats() {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const response = await fetchWithBrowserSession(`/api/search/chats?q=${encodeURIComponent(query)}&scope=all`, {
        cache: 'no-store',
      });
      if (!response.response.ok) {
        setSearchResults([]);
        return;
      }
      const payload = await response.response.json() as { matches?: ChatSearchMatch[] };
      setSearchResults(payload.matches ?? []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  const workspaceId = session?.workspaceId ?? currentProject?.workspaceId ?? null;
  const studioHomeHref = buildStudioRoute({
    mode: 'nl',
    sessionId: session?.id ?? null,
    projectId: currentProject?.id ?? null,
    workspaceId,
  });

  const projectName = (projectId: string | null) =>
    projectId ? projects.find(project => project.id === projectId)?.name ?? 'Project attached' : 'No project';

  const formatSessionDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Updated';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const runSessionAction = async (sessionId: string, action: () => Promise<void>) => {
    setBusySessionId(sessionId);
    try {
      await action();
    } finally {
      setBusySessionId(null);
    }
  };

  const beginRename = (item: SessionListItem) => {
    setEditingSessionId(item.id);
    setEditingTitle(item.title);
    setProjectMenuSessionId(null);
  };

  const submitRename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const sessionId = editingSessionId;
    if (!sessionId) return;
    await runSessionAction(sessionId, () => renameSession(sessionId, editingTitle));
    setEditingSessionId(null);
    setEditingTitle('');
  };

  return (
    <div className="agentos-sidebar studio-chat-sidebar">
      <Link href={studioHomeHref} className="agentos-sidebar-brand">AgentOS Studio</Link>
      <button type="button" onClick={() => void startNewChat()} className="studio-sidebar-new">
        <span>+</span>
        New chat
      </button>

      <form className="studio-chat-search" onSubmit={event => {
        event.preventDefault();
        void searchChats();
      }}>
        <input
          type="search"
          value={searchQuery}
          onChange={event => setSearchQuery(event.target.value)}
          placeholder="Search chats"
          aria-label="Search chats"
        />
        <button type="submit" aria-label="Search">{searching ? '...' : 'Search'}</button>
      </form>

      <nav className="studio-sidebar-modes" aria-label="Studio modes">
        <span>Studio modes</span>
        {STUDIO_MODES.map(item => (
          <button
            key={item.key}
            type="button"
            className={mode === item.key ? 'active' : ''}
            aria-current={mode === item.key ? 'page' : undefined}
            title={item.description}
            onClick={() => setMode(item.key)}
          >
            {item.shortLabel}
          </button>
        ))}
      </nav>

      {currentProject ? (
        <div className="studio-sidebar-project">
          <span>Project</span>
          <strong>{currentProject.name}</strong>
        </div>
      ) : null}

      <nav className="studio-sidebar-sessions" aria-label="Recent chats">
        <span className="studio-sidebar-label">{searchResults.length > 0 ? 'Search results' : 'Recent chats'}</span>
        {searchResults.length > 0 ? searchResults.map(item => (
          <button key={item.messageId} type="button" onClick={() => void selectSession(item.sessionId)} className="studio-session-search-result">
            <strong>{item.sessionTitle}</strong>
            <small>{item.snippet}</small>
          </button>
        )) : recentSessions.length > 0 ? recentSessions.map(item => (
          <article key={item.id} className={`studio-session-row${item.id === session?.id ? ' active' : ''}`}>
            {editingSessionId === item.id ? (
              <form className="studio-session-rename" onSubmit={event => void submitRename(event)}>
                <input
                  aria-label={`Rename ${item.title}`}
                  value={editingTitle}
                  onChange={event => setEditingTitle(event.target.value)}
                  autoFocus
                />
                <button type="submit" disabled={busySessionId === item.id} title="Save the new session name">Save</button>
                <button type="button" onClick={() => setEditingSessionId(null)} title="Cancel rename">Cancel</button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => void selectSession(item.id)}
                className="studio-session-open"
                title="Continue this session"
              >
                <strong>{item.pinnedAt ? 'Pinned: ' : ''}{item.title}</strong>
                <small>{projectName(item.projectId)} | {item.visibility} | {formatSessionDate(item.updatedAt)}</small>
              </button>
            )}
            <div className="studio-session-actions" aria-label={`${item.title} session actions`}>
              <button type="button" onClick={() => void selectSession(item.id)} disabled={busySessionId === item.id} title="Continue this session">Open</button>
              <button type="button" onClick={() => beginRename(item)} disabled={busySessionId === item.id} title="Rename this session">Rename</button>
              <button
                type="button"
                onClick={() => void runSessionAction(item.id, () => pinSession(item.id, !item.pinnedAt))}
                disabled={busySessionId === item.id}
                title={item.pinnedAt ? 'Unpin this session' : 'Pin this session'}
              >
                {item.pinnedAt ? 'Unpin' : 'Pin'}
              </button>
              <button
                type="button"
                onClick={() => setProjectMenuSessionId(projectMenuSessionId === item.id ? null : item.id)}
                disabled={busySessionId === item.id}
                title={projects.length > 0 ? 'Attach this session to a project' : 'No projects are available to attach'}
              >
                Attach
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Archive "${item.title}"?`)) {
                    void runSessionAction(item.id, () => archiveSession(item.id));
                  }
                }}
                disabled={busySessionId === item.id}
                title="Archive this session"
              >
                Archive
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Delete "${item.title}"? This removes it from Studio history.`)) {
                    void runSessionAction(item.id, () => deleteSession(item.id));
                  }
                }}
                disabled={busySessionId === item.id}
                title="Delete this session"
              >
                Delete
              </button>
            </div>
            {projectMenuSessionId === item.id ? (
              <div className="studio-session-project-menu" role="menu" aria-label={`Attach ${item.title} to project`}>
                {projects.length > 0 ? projects.map(project => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => {
                      setProjectMenuSessionId(null);
                      void runSessionAction(item.id, () => attachSessionToProject(item.id, project.id));
                    }}
                    disabled={item.projectId === project.id || busySessionId === item.id}
                    title={item.projectId === project.id ? 'Already attached to this project' : `Attach to ${project.name}`}
                  >
                    {project.name}{item.projectId === project.id ? ' (current)' : ''}
                  </button>
                )) : <span>No projects available.</span>}
              </div>
            ) : null}
          </article>
        )) : <span className="studio-sidebar-empty">No chats yet</span>}
      </nav>

      <style>{`
        .studio-chat-sidebar {
          height: 100%;
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 14px 10px;
        }

        .studio-chat-sidebar .agentos-sidebar-brand {
          padding: 2px 8px 8px;
        }

        .studio-sidebar-new {
          min-height: 38px;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 11px;
          border: 1px solid rgba(20, 184, 166, 0.28);
          border-radius: 10px;
          background: rgba(20, 184, 166, 0.1);
          color: var(--text-primary);
          font-size: 0.82rem;
          cursor: pointer;
        }

        .studio-chat-search {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          border: 1px solid var(--border);
          border-radius: 9px;
          background: rgba(255,255,255,0.022);
          overflow: hidden;
        }

        .studio-chat-search input {
          min-width: 0;
          height: 34px;
          padding: 0 9px;
          border: 0;
          outline: 0;
          background: transparent;
          color: var(--text-primary);
          font-size: 0.78rem;
        }

        .studio-chat-search button {
          border: 0;
          padding: 0 8px;
          background: transparent;
          color: var(--text-tertiary);
          font-size: 0.68rem;
          cursor: pointer;
        }

        .studio-sidebar-modes {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 4px;
        }

        .studio-sidebar-modes > span,
        .studio-sidebar-label,
        .studio-sidebar-project span {
          grid-column: 1 / -1;
          padding: 4px 7px 2px;
          color: var(--text-tertiary);
          font-family: var(--font-mono), monospace;
          font-size: 0.64rem;
          text-transform: uppercase;
        }

        .studio-sidebar-modes button {
          min-height: 30px;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 7px;
          background: transparent;
          color: var(--text-secondary);
          font-size: 0.7rem;
          cursor: pointer;
        }

        .studio-sidebar-modes button.active,
        .studio-sidebar-modes button:hover {
          background: rgba(255,255,255,0.055);
          color: var(--text-primary);
        }

        .studio-sidebar-project {
          display: grid;
          gap: 2px;
          padding: 7px;
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
        }

        .studio-sidebar-project span {
          padding: 0;
        }

        .studio-sidebar-project strong {
          overflow: hidden;
          color: var(--text-secondary);
          font-size: 0.76rem;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .studio-sidebar-sessions {
          min-height: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 3px;
          overflow-y: auto;
        }

        .studio-session-search-result,
        .studio-session-open {
          width: 100%;
          min-height: 34px;
          display: grid;
          gap: 2px;
          padding: 8px;
          border: 0;
          border-radius: 8px;
          background: transparent;
          color: var(--text-secondary);
          text-align: left;
          cursor: pointer;
        }

        .studio-session-search-result:hover,
        .studio-session-open:hover,
        .studio-session-row.active .studio-session-open {
          background: rgba(255,255,255,0.055);
          color: var(--text-primary);
        }

        .studio-session-row {
          display: grid;
          gap: 4px;
          padding: 3px;
          border-radius: 9px;
        }

        .studio-session-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 3px;
          padding: 0 4px 4px;
        }

        .studio-session-actions button,
        .studio-session-project-menu button,
        .studio-session-rename button {
          min-height: 24px;
          padding: 0 7px;
          border: 1px solid var(--border);
          border-radius: 7px;
          background: rgba(255,255,255,0.025);
          color: var(--text-tertiary);
          font-size: 0.66rem;
          cursor: pointer;
        }

        .studio-session-actions button:hover,
        .studio-session-project-menu button:hover,
        .studio-session-rename button:hover {
          color: var(--text-primary);
          border-color: rgba(255,255,255,0.2);
        }

        .studio-session-actions button:disabled,
        .studio-session-project-menu button:disabled,
        .studio-session-rename button:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        .studio-session-project-menu {
          display: grid;
          gap: 3px;
          padding: 5px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: rgba(0,0,0,0.18);
        }

        .studio-session-project-menu span {
          padding: 4px;
          color: var(--text-tertiary);
          font-size: 0.68rem;
        }

        .studio-session-rename {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto auto;
          gap: 3px;
        }

        .studio-session-rename input {
          min-width: 0;
          height: 28px;
          padding: 0 7px;
          border: 1px solid var(--border);
          border-radius: 7px;
          background: rgba(255,255,255,0.025);
          color: var(--text-primary);
          font-size: 0.72rem;
        }

        .studio-sidebar-sessions strong,
        .studio-sidebar-sessions small {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .studio-sidebar-sessions strong {
          font-size: 0.78rem;
          font-weight: 500;
        }

        .studio-sidebar-sessions small,
        .studio-sidebar-empty {
          color: var(--text-tertiary);
          font-size: 0.68rem;
        }

        .studio-sidebar-empty {
          padding: 7px;
        }
      `}</style>
    </div>
  );
}
