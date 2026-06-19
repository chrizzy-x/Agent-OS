'use client';

import ModeSwitch from '@/components/studio/ModeSwitch';
import { useStudio } from '@/components/studio/StudioProvider';

export default function StudioTopbar() {
  const {
    mode,
    setMode,
    currentProject,
    session,
    workspaces,
    notifications,
    browserSession,
    openContext,
    startNewChat,
  } = useStudio();
  const nlMode = mode === 'nl';
  const modelLabel = process.env.NEXT_PUBLIC_AGENTOS_MODEL ?? 'Default model';
  const workspace = workspaces.find(item => item.id === session?.workspaceId)
    ?? workspaces.find(item => item.id === currentProject?.workspaceId)
    ?? workspaces[0]
    ?? null;

  return (
    <header className={`studio-switchbar${nlMode ? ' nl' : ''}`}>
      <div className="studio-switchbar-title">
        <strong>{nlMode ? session?.title ?? 'New chat' : currentProject?.name ?? 'AgentOS Studio'}</strong>
        <span>{workspace?.name ?? 'Workspace'}</span>
        <span>{currentProject?.name ?? 'No project'}</span>
      </div>
      <ModeSwitch mode={mode} onChange={setMode} />
      <div className="studio-switchbar-actions">
        {nlMode ? <button type="button" onClick={() => void startNewChat()}>New chat</button> : null}
        <button type="button" onClick={() => openContext('notifications')}>Alerts {notifications.filter(item => item.status === 'unread').length}</button>
        <button type="button" onClick={() => openContext(nlMode ? 'memory' : 'logs')}>Context</button>
        <span className="studio-switchbar-user">{browserSession?.agentName ?? 'User'} · {modelLabel}</span>
      </div>
      <style>{`
        .studio-switchbar {
          min-height: 52px;
          display: grid;
          grid-template-columns: minmax(150px, 1fr) minmax(260px, 430px) minmax(150px, 1fr);
          align-items: center;
          gap: 12px;
          padding: 7px 14px;
          border-bottom: 1px solid var(--border);
          background: color-mix(in srgb, var(--bg-primary) 94%, transparent);
        }

        .studio-switchbar-title {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .studio-switchbar-title strong {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 0.86rem;
        }

        .studio-switchbar-title span {
          flex: 0 0 auto;
          color: var(--text-tertiary);
          font-size: 0.7rem;
        }

        .studio-switchbar-actions {
          min-width: 0;
          display: flex;
          justify-content: flex-end;
          gap: 6px;
        }

        .studio-switchbar-user {
          align-self: center;
          color: var(--text-tertiary);
          font-size: 0.68rem;
          white-space: nowrap;
        }

        .studio-switchbar-actions button {
          min-height: 32px;
          padding: 0 10px;
          border: 1px solid var(--border);
          border-radius: 9px;
          background: rgba(255,255,255,0.025);
          color: var(--text-secondary);
          font-size: 0.76rem;
          cursor: pointer;
        }

        .studio-switchbar-actions button:hover {
          color: var(--text-primary);
          background: rgba(255,255,255,0.055);
        }

        @media (max-width: 1700px) {
          .studio-switchbar-user {
            display: none;
          }
        }

        @media (max-width: 1279px) {
          .studio-switchbar {
            min-height: 48px;
            grid-template-columns: auto minmax(0, 1fr) auto;
            gap: 8px;
            padding: 6px 10px;
          }

          .studio-switchbar-title {
            grid-column: 2;
            grid-row: 1;
          }

          .studio-switchbar .studio-mode-switch {
            grid-column: 1 / -1;
            grid-row: 2;
          }

          .studio-switchbar-actions {
            grid-column: 3;
            grid-row: 1;
          }

          .studio-switchbar-title span {
            display: none;
          }

          .studio-switchbar-actions button:first-child:not(:last-child) {
            display: none;
          }
        }

        @media (max-width: 520px) {
          .studio-switchbar-title span,
          .studio-switchbar-actions button {
            display: none;
          }
        }
      `}</style>
    </header>
  );
}
