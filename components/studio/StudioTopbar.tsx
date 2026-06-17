'use client';

import { Button } from '@/components/os/ui';
import ModeSwitch from '@/components/studio/ModeSwitch';
import { useStudio } from '@/components/studio/StudioProvider';

export default function StudioTopbar() {
  const { mode, setMode, currentProject, setSidebarOpen, openContext } = useStudio();

  return (
    <header className="studio-switchbar">
      <Button variant="secondary" onClick={() => setSidebarOpen(true)} className="studio-mobile-only">Menu</Button>
      <ModeSwitch mode={mode} onChange={setMode} />
      <div className="studio-switchbar-context">{currentProject?.name ?? 'Super AgentOS'}</div>
      <div className="studio-mobile-context-actions">
        <button type="button" onClick={() => openContext('logs')}>Logs</button>
        <button type="button" onClick={() => openContext('recovery')}>Recovery</button>
        <button type="button" onClick={() => openContext('notifications')}>Alerts</button>
        <button type="button" className="danger" onClick={() => window.dispatchEvent(new Event('agentos:open-panic'))}>Panic</button>
      </div>
      <style>{`
        .studio-switchbar {
          min-height: 48px;
          display: grid;
          grid-template-columns: auto minmax(220px, 430px) minmax(0, 1fr);
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          border-bottom: 1px solid var(--border);
        }

        .studio-switchbar-context {
          margin-left: auto;
          color: var(--text-tertiary);
          font-size: 0.8rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .studio-mobile-context-actions {
          display: none;
        }

        @media (max-width: 960px) {
          .studio-switchbar {
            grid-template-columns: auto minmax(0, 1fr);
            grid-template-rows: auto auto;
          }

          .studio-switchbar-context {
            display: none;
          }

          .studio-mobile-context-actions {
            grid-column: 1 / -1;
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 6px;
          }

          .studio-mobile-context-actions button {
            min-height: 30px;
            border: 1px solid var(--border);
            border-radius: 8px;
            background: rgba(255,255,255,0.035);
            color: var(--text-secondary);
            font-size: 0.72rem;
            font-weight: 700;
          }

          .studio-mobile-context-actions button.danger {
            border-color: rgba(248, 113, 113, 0.35);
            color: #fecaca;
            background: linear-gradient(135deg, rgba(127, 29, 29, 0.68), rgba(40, 12, 18, 0.78));
          }
        }
      `}</style>
    </header>
  );
}
