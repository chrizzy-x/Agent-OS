'use client';

import Link from 'next/link';
import { useState } from 'react';
import { fetchWithBrowserSession } from '@/src/auth/browser-session';
import { useStudio } from '@/components/studio/StudioProvider';

type ChatSearchMatch = {
  messageId: string;
  sessionId: string;
  sessionTitle: string;
  snippet: string;
};

export default function StudioSidebar() {
  const {
    sessions,
    session,
    selectSession,
    startNewChat,
    currentProject,
    mode,
  } = useStudio();
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ChatSearchMatch[]>([]);
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

  return (
    <div className="agentos-sidebar studio-chat-sidebar">
      <Link href="/studio?mode=nl" className="agentos-sidebar-brand">AgentOS Studio</Link>
      <button type="button" onClick={() => void startNewChat()} className="studio-sidebar-new">
        <span>＋</span>
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
        <button type="submit" aria-label="Search">{searching ? '…' : '⌕'}</button>
      </form>

      <nav className="studio-sidebar-modes" aria-label="Studio modes">
        <span>Studio modes</span>
        <Link href="/studio?mode=nl" className={mode === 'nl' ? 'active' : ''}>NL</Link>
        <Link href="/studio?mode=workflow" className={mode === 'workflow' ? 'active' : ''}>Workflow</Link>
        <Link href="/studio?mode=code" className={mode === 'code' ? 'active' : ''}>Code</Link>
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
          <button key={item.messageId} type="button" onClick={() => void selectSession(item.sessionId)}>
            <strong>{item.sessionTitle}</strong>
            <small>{item.snippet}</small>
          </button>
        )) : recentSessions.length > 0 ? recentSessions.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => void selectSession(item.id)}
            className={item.id === session?.id ? 'active' : ''}
          >
            <strong>{item.pinnedAt ? '• ' : ''}{item.title}</strong>
          </button>
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
          grid-template-columns: minmax(0, 1fr) 32px;
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
          background: transparent;
          color: var(--text-tertiary);
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

        .studio-sidebar-modes a {
          min-height: 30px;
          display: grid;
          place-items: center;
          border-radius: 7px;
          color: var(--text-secondary);
          font-size: 0.7rem;
          text-decoration: none;
        }

        .studio-sidebar-modes a.active,
        .studio-sidebar-modes a:hover {
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

        .studio-sidebar-sessions button {
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

        .studio-sidebar-sessions button:hover,
        .studio-sidebar-sessions button.active {
          background: rgba(255,255,255,0.055);
          color: var(--text-primary);
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
