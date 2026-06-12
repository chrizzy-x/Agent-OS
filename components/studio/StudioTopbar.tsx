'use client';

import { Badge, Button } from '@/components/os/ui';
import ModeSwitch from '@/components/studio/ModeSwitch';
import { useStudio } from '@/components/studio/StudioProvider';

export default function StudioTopbar() {
  const {
    browserSession,
    mode,
    setMode,
    session,
    lineage,
    currentProject,
    createSession,
    advancedMode,
    enableAdvancedMode,
    openContext,
    setSidebarOpen,
    panicStop,
    notifications,
  } = useStudio();

  return (
    <header
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
        padding: '18px 20px',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Button variant="secondary" onClick={() => setSidebarOpen(true)} className="studio-mobile-only">Menu</Button>
        <div style={{ display: 'grid', gap: 4 }}>
          <strong>Super AgentOS</strong>
          <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            {currentProject?.name ?? 'Project'}{browserSession?.agentName ? ` · ${browserSession.agentName}` : ''}
          </span>
        </div>
        <Badge tone="accent">{currentProject?.status ?? 'active'}</Badge>
        {session ? <Badge tone="default">{session.visibility}</Badge> : null}
        {lineage.parent ? <Badge tone="success">Branch</Badge> : null}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <ModeSwitch mode={mode} onChange={setMode} />
        {advancedMode ? (
          <Badge tone="success">Advanced mode</Badge>
        ) : (
          <Button variant="secondary" onClick={enableAdvancedMode}>Enable terminal</Button>
        )}
        <Button variant="secondary" onClick={createSession}>New chat</Button>
        <Button variant="secondary" onClick={() => openContext('memory')}>Memory</Button>
        <Button variant="secondary" onClick={() => openContext('files')}>Files</Button>
        <Button variant="secondary" onClick={() => openContext('notifications')}>
          Alerts{notifications.filter(item => item.status === 'unread').length > 0 ? ` (${notifications.filter(item => item.status === 'unread').length})` : ''}
        </Button>
        <Button variant="secondary" onClick={() => openContext('logs')}>Context</Button>
        <Button variant="danger" onClick={panicStop}>Panic</Button>
      </div>
    </header>
  );
}
