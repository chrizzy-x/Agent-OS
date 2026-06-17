'use client';

import Link from 'next/link';
import { useStudio } from '@/components/studio/StudioProvider';

const NAV_GROUPS: Array<Array<{ href: string; label: string }>> = [
  [
    { href: '/studio?mode=nl', label: 'New Chat' },
    { href: '/studio?mode=nl', label: 'Chats' },
  ],
  [
    { href: '/projects', label: 'Projects' },
    { href: '/library', label: 'Library' },
  ],
  [
    { href: '/apps', label: 'Apps' },
    { href: '/skills/installed', label: 'Skills' },
    { href: '/workflows', label: 'Workflows' },
    { href: '/subagents', label: 'Subagents' },
  ],
  [
    { href: '/appstore', label: 'App Store' },
    { href: '/skills', label: 'Skill Store' },
  ],
  [
    { href: '/memory', label: 'Memory' },
    { href: '/vault', label: 'Vault' },
    { href: '/mcp', label: 'MCP' },
    { href: '/ffp', label: 'FFP' },
  ],
  [
    { href: '/developer', label: 'Developer' },
  ],
  [
    { href: '/settings', label: 'Settings' },
  ],
];

export default function StudioSidebar() {
  const { sessions, session, selectSession, createSession } = useStudio();
  const recentSessions = sessions.filter(item => !item.archivedAt && !item.deletedAt).slice(0, 8);

  return (
    <div className="agentos-sidebar">
      <Link href="/studio" className="agentos-sidebar-brand">Super AgentOS</Link>
      <nav className="agentos-sidebar-nav" aria-label="Studio navigation">
        <div className="agentos-sidebar-group">
          <button type="button" onClick={() => void createSession()} className="agentos-sidebar-action">New Chat</button>
          <span className="agentos-sidebar-caption">Chats</span>
          {recentSessions.length > 0 ? recentSessions.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => selectSession(item.id)}
              className={`agentos-chat-link${item.id === session?.id ? ' active' : ''}`}
            >
              <span>{item.title}</span>
            </button>
          )) : <span className="agentos-sidebar-empty">No chats</span>}
        </div>
        {NAV_GROUPS.slice(1).map((group, groupIndex) => (
          <div key={`group-${groupIndex}`} className="agentos-sidebar-group">
            {group.map(item => (
              <Link key={`${item.href}-${item.label}`} href={item.href}>{item.label}</Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="agentos-sidebar-bottom">
        <button type="button" className="agentos-health">Healthy</button>
      </div>
      <style>{`
        .agentos-sidebar-action,
        .agentos-chat-link {
          min-height: 28px;
          display: flex;
          align-items: center;
          width: 100%;
          padding: 0 8px;
          border: 0;
          border-radius: 6px;
          background: transparent;
          color: var(--text-secondary);
          font-size: 0.8125rem;
          text-align: left;
          cursor: pointer;
        }

        .agentos-sidebar-action,
        .agentos-chat-link.active,
        .agentos-chat-link:hover {
          color: var(--text-primary);
          background: rgba(255,255,255,0.055);
        }

        .agentos-chat-link span {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .agentos-sidebar-caption,
        .agentos-sidebar-empty {
          padding: 4px 8px;
          color: var(--text-tertiary);
          font-family: var(--font-mono), monospace;
          font-size: 0.67rem;
          text-transform: uppercase;
        }
      `}</style>
    </div>
  );
}
