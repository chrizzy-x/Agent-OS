'use client';

import { Drawer } from '@/components/os/overlays';
import { useStudio } from '@/components/studio/StudioProvider';

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

export default function StudioContextDrawer() {
  const {
    contextOpen,
    closeContext,
    contextSection,
    openContext,
    installedApps,
    installedSkills,
    workflows,
    vaultSecrets,
    terminalEvents,
    events,
    superAgent,
  } = useStudio();

  const title = contextSection.charAt(0).toUpperCase() + contextSection.slice(1);

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
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {(['apps', 'skills', 'workflows', 'memory', 'vault', 'logs'] as const).map(section => (
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
      {contextSection === 'workflows' ? <SectionList title="Workflows" items={workflows.map(item => ({ id: item.id, title: item.name, body: item.summary ?? item.status }))} /> : null}
      {contextSection === 'vault' ? <SectionList title="Vault" items={vaultSecrets.map(item => ({ id: item.id, title: item.name, body: item.status }))} /> : null}
      {contextSection === 'logs' ? <SectionList title="Logs" items={[
        ...events.slice(-8).map(item => ({ id: `studio-${item.id}`, title: item.type, body: JSON.stringify(item.payload) })),
        ...terminalEvents.slice(-8).map(item => ({ id: `terminal-${item.id}`, title: item.type, body: item.chunk ?? item.message ?? '' })),
      ]} /> : null}
      {contextSection === 'memory' ? <SectionList title="Memory" items={superAgent ? [{
        id: superAgent.id,
        title: superAgent.name,
        body: superAgent.instructions || 'This project shares one Super AgentOS context across both Studio modes.',
      }] : []} /> : null}
    </Drawer>
  );
}
