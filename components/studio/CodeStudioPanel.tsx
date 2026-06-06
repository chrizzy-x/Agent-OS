'use client';

import { Button } from '@/components/os/ui';
import { useStudio } from '@/components/studio/StudioProvider';
import type { StudioFileNode } from '@/src/studio/types';

function FileTree(props: { nodes: StudioFileNode[]; onOpen: (path: string) => void }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {props.nodes.map(node => (
        <div key={node.id} style={{ display: 'grid', gap: 6 }}>
          <button
            type="button"
            onClick={() => node.kind === 'file' && props.onOpen(node.path)}
            style={{
              minHeight: 34,
              padding: '0 10px',
              borderRadius: 10,
              border: '1px solid transparent',
              background: 'transparent',
              color: 'inherit',
              textAlign: 'left',
              cursor: node.kind === 'file' ? 'pointer' : 'default',
            }}
          >
            {node.kind === 'directory' ? '▾ ' : ''}{node.name}
          </button>
          {node.children?.length ? (
            <div style={{ paddingLeft: 14 }}>
              <FileTree nodes={node.children} onOpen={props.onOpen} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default function CodeStudioPanel() {
  const {
    fileTree,
    tabs,
    activeTabId,
    setActiveTabId,
    openFile,
    updateTabContent,
    saveActiveTab,
    terminal,
    terminalEvents,
    terminalDraft,
    setTerminalDraft,
    advancedMode,
    enableAdvancedMode,
    startTerminal,
    sendTerminalInput,
  } = useStudio();

  const activeTab = tabs.find(tab => tab.id === activeTabId) ?? tabs[0] ?? null;

  return (
    <div className="studio-code-layout">
      <aside className="studio-code-files">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
          <strong>Files</strong>
        </div>
        {fileTree.length > 0 ? <FileTree nodes={fileTree} onOpen={path => void openFile(path)} /> : <span style={{ color: 'var(--text-secondary)' }}>No files yet.</span>}
      </aside>

      <section className="studio-code-editor">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTabId(tab.id)}
              style={{
                minHeight: 36,
                padding: '0 14px',
                borderRadius: 999,
                border: '1px solid var(--border)',
                background: tab.id === activeTab?.id ? 'rgba(20, 184, 166, 0.16)' : 'rgba(255,255,255,0.03)',
                color: 'inherit',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.name}{tab.dirty ? ' •' : ''}
            </button>
          ))}
          <div style={{ marginLeft: 'auto' }}>
            <Button variant="secondary" onClick={() => void saveActiveTab()}>{activeTab?.dirty ? 'Save' : 'Saved'}</Button>
          </div>
        </div>
        {activeTab ? (
          <textarea
            value={activeTab.content}
            onChange={event => updateTabContent(activeTab.id, event.target.value)}
            readOnly={activeTab.readonly}
            style={{
              width: '100%',
              minHeight: 0,
              flex: 1,
              border: 'none',
              outline: 'none',
              resize: 'none',
              padding: 18,
              background: 'transparent',
              color: 'inherit',
              fontFamily: 'var(--font-mono), monospace',
              fontSize: 14,
              lineHeight: 1.7,
            }}
          />
        ) : (
          <div style={{ padding: 24, color: 'var(--text-secondary)' }}>Open a file to start editing.</div>
        )}
      </section>

      <section className="studio-code-terminal">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          <strong>Terminal</strong>
          {terminal ? (
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{terminal.status}</span>
          ) : advancedMode ? (
            <Button variant="secondary" onClick={() => void startTerminal()}>Start terminal</Button>
          ) : (
            <Button variant="secondary" onClick={enableAdvancedMode}>Enable terminal</Button>
          )}
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 14, fontFamily: 'var(--font-mono), monospace', fontSize: 13, lineHeight: 1.6 }}>
          {terminalEvents.length > 0 ? terminalEvents.map(event => (
            <div key={event.id} style={{ color: event.type === 'stderr' || event.type === 'error' ? '#fecaca' : 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
              {event.chunk ?? event.message ?? ''}
            </div>
          )) : (
            <span style={{ color: 'var(--text-secondary)' }}>Terminal output will appear here.</span>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, padding: 14, borderTop: '1px solid var(--border)' }}>
          <input
            value={terminalDraft}
            onChange={event => setTerminalDraft(event.target.value)}
            placeholder={advancedMode ? 'Run a command' : 'Enable terminal to run commands'}
            disabled={!advancedMode}
            className="os-input"
          />
          <Button onClick={() => void sendTerminalInput()} disabled={!advancedMode || !terminal}>Run</Button>
        </div>
      </section>
    </div>
  );
}
