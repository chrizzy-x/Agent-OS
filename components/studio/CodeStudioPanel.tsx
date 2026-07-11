'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/os/ui';
import { useStudio } from '@/components/studio/StudioProvider';
import type { StudioFileNode } from '@/src/studio/types';

const DEV_TASK_PRESETS = [
  {
    id: 'plan',
    label: 'Plan',
    terminal: 'git status --short',
    prompt: 'Review the active project context, identify the safest implementation plan, and list the files, tests, and risks before editing.',
  },
  {
    id: 'test',
    label: 'Test',
    terminal: 'npm test',
    prompt: 'Prepare a focused test plan for the active project and explain which unit, integration, and browser checks should run.',
  },
  {
    id: 'build',
    label: 'Build',
    terminal: 'npm run build',
    prompt: 'Check build readiness for the active project, including type, lint, environment, and runtime risks.',
  },
  {
    id: 'deploy',
    label: 'Deploy',
    terminal: 'npm run build',
    prompt: 'Prepare a deployment checklist for the active project. Include build status, environment requirements, rollback risk, and post-deploy browser QA.',
  },
];

function summarizePayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return typeof payload === 'string' && payload.trim() ? payload.trim().slice(0, 180) : 'Event recorded.';
  }

  const blocked = new Set(['secret', 'token', 'password', 'authorization', 'apiKey', 'api_key']);
  const parts = Object.entries(payload as Record<string, unknown>)
    .filter(([key, value]) => !blocked.has(key) && ['string', 'number', 'boolean'].includes(typeof value))
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${String(value).slice(0, 80)}`);

  return parts.length > 0 ? parts.join(' | ') : 'Event metadata recorded.';
}

function FileTree(props: { nodes: StudioFileNode[]; onOpen: (path: string) => void }) {
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      {props.nodes.map(node => (
        <div key={node.id} style={{ display: 'grid', gap: 4 }}>
          <button
            type="button"
            onClick={() => node.kind === 'file' && props.onOpen(node.path)}
            style={{
              minHeight: 28,
              padding: '0 8px',
              borderRadius: 6,
              border: '1px solid transparent',
              background: 'transparent',
              color: 'inherit',
              textAlign: 'left',
              cursor: node.kind === 'file' ? 'pointer' : 'default',
              fontSize: 13,
            }}
          >
            {node.kind === 'directory' ? '> ' : ''}{node.name}
          </button>
          {node.children?.length ? (
            <div style={{ paddingLeft: 12 }}>
              <FileTree nodes={node.children} onOpen={props.onOpen} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function countFiles(nodes: StudioFileNode[]): number {
  return nodes.reduce((count, node) => count + (node.kind === 'file' ? 1 : 0) + (node.children ? countFiles(node.children) : 0), 0);
}

export default function CodeStudioPanel() {
  const {
    session,
    workspaces,
    currentProject,
    installedApps,
    installedSkills,
    workflows,
    fileEntries,
    executions,
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
    events,
    advancedMode,
    enableAdvancedMode,
    startTerminal,
    sendTerminalInput,
    setComposerValue,
    sendMessage,
    setMode,
  } = useStudio();

  const activeTab = tabs.find(tab => tab.id === activeTabId) ?? tabs[0] ?? null;
  const [taskDraft, setTaskDraft] = useState('');
  const [taskNotice, setTaskNotice] = useState('');
  const [taskSending, setTaskSending] = useState(false);
  const fileCount = useMemo(() => countFiles(fileTree), [fileTree]);
  const deploymentConnector = installedApps.find(app => /vercel|netlify|render|railway|fly|deployment|deploy/i.test(`${app.name} ${app.slug} ${app.description}`));
  const recentExecutions = executions.slice(0, 5);

  function buildDeveloperPrompt(message: string): string {
    const workspaceName = workspaces.find(workspace => workspace.id === session?.workspaceId)?.name ?? 'No workspace selected';
    const activeFiles = tabs.map(tab => tab.path).slice(0, 6).join(', ') || 'No open files';
    return [
      message.trim(),
      '',
      'Code Studio context:',
      `Workspace: ${workspaceName}`,
      `Project: ${currentProject?.name ?? 'No project selected'}`,
      `Session: ${session?.title ?? 'No active session'}`,
      `Open files: ${activeFiles}`,
      `Indexed files: ${fileCount}`,
      `Installed apps: ${installedApps.length}`,
      `Installed skills: ${installedSkills.length}`,
      `Available workflows: ${workflows.length}`,
      `Terminal: ${terminal?.status ?? 'not started'}`,
    ].join('\n');
  }

  async function sendDeveloperTask() {
    if (!taskDraft.trim()) {
      setTaskNotice('Enter a developer task first.');
      return;
    }
    setTaskSending(true);
    setTaskNotice('');
    const prompt = buildDeveloperPrompt(taskDraft);
    try {
      setComposerValue(prompt);
      await sendMessage(prompt);
      setMode('nl');
      setTaskDraft('');
    } catch {
      setTaskNotice('Super AgentOS could not accept the task. Try again from NL Studio.');
    } finally {
      setTaskSending(false);
    }
  }

  function applyPreset(preset: (typeof DEV_TASK_PRESETS)[number]) {
    setTaskDraft(preset.prompt);
    setTerminalDraft(preset.terminal);
    setTaskNotice(`${preset.label} prompt loaded. Review it before sending or running the terminal command.`);
  }

  function prepareTerminalCommand(command: string) {
    setTerminalDraft(command);
    setTaskNotice('Command staged in the terminal input. Enable and start the terminal before running it.');
  }

  return (
    <div className="studio-code-layout">
      <aside className="studio-code-files">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
          <strong>Explorer</strong>
        </div>
        <div style={{ display: 'grid', gap: 6, marginBottom: 12, color: 'var(--text-secondary)', fontSize: 12 }}>
          <span>Project: {currentProject?.name ?? 'No project selected'}</span>
          <span>Files indexed: {fileCount}</span>
          <span>Workspace assets: {fileEntries.length}</span>
        </div>
        {fileTree.length > 0 ? <FileTree nodes={fileTree} onOpen={path => void openFile(path)} /> : <span style={{ color: 'var(--text-secondary)' }}>No files yet.</span>}
      </aside>

      <section className="studio-code-editor">
        <div style={{ display: 'grid', gap: 10, padding: 12, borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.018)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <strong>Developer task</strong>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                Project-aware task composer for implementation, test, build, and release work.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {DEV_TASK_PRESETS.map(preset => (
                <Button key={preset.id} variant="secondary" onClick={() => applyPreset(preset)}>{preset.label}</Button>
              ))}
            </div>
          </div>
          <textarea
            value={taskDraft}
            onChange={event => setTaskDraft(event.target.value)}
            placeholder="Ask Super AgentOS to inspect, implement, test, build, or prepare deployment for this project."
            aria-label="Developer task"
            style={{
              width: '100%',
              minHeight: 68,
              resize: 'vertical',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 10,
              background: 'rgba(0,0,0,0.16)',
              color: 'inherit',
              font: 'inherit',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Button variant="secondary" onClick={() => prepareTerminalCommand('npm test')}>Stage test</Button>
              <Button variant="secondary" onClick={() => prepareTerminalCommand('npm run lint')}>Stage lint</Button>
              <Button variant="secondary" onClick={() => prepareTerminalCommand('npm run build')}>Stage build</Button>
            </div>
            <Button onClick={() => void sendDeveloperTask()} loading={taskSending} disabled={!taskDraft.trim()} disabledReason={!taskDraft.trim() ? 'Enter a developer task first.' : undefined}>
              Ask Super AgentOS
            </Button>
          </div>
          {taskNotice ? <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{taskNotice}</div> : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTabId(tab.id)}
              style={{
                minHeight: 30,
                padding: '0 10px',
                borderRadius: 7,
                border: '1px solid var(--border)',
                background: tab.id === activeTab?.id ? 'rgba(20, 184, 166, 0.14)' : 'rgba(255,255,255,0.025)',
                color: 'inherit',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                fontSize: 13,
              }}
            >
              {tab.name}{tab.dirty ? ' *' : ''}
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
              padding: 14,
              background: 'transparent',
              color: 'inherit',
              fontFamily: 'var(--font-mono), monospace',
              fontSize: 13,
              lineHeight: 1.6,
            }}
          />
        ) : (
          <div style={{ padding: 18, color: 'var(--text-secondary)' }}>Open a file to start editing.</div>
        )}
      </section>

      <section className="studio-code-terminal">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
          <strong>Terminal</strong>
          {terminal ? (
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{terminal.status}</span>
          ) : advancedMode ? (
            <Button variant="secondary" onClick={() => void startTerminal()}>Start terminal</Button>
          ) : (
            <Button variant="secondary" onClick={enableAdvancedMode}>Enable terminal</Button>
          )}
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 10, fontFamily: 'var(--font-mono), monospace', fontSize: 12, lineHeight: 1.55 }}>
          {terminalEvents.length > 0 ? terminalEvents.map(event => (
            <div key={event.id} style={{ color: event.type === 'stderr' || event.type === 'error' ? '#fecaca' : 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
              {event.chunk ?? event.message ?? ''}
            </div>
          )) : (
            <span style={{ color: 'var(--text-secondary)' }}>Terminal output will appear here.</span>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, padding: 10, borderTop: '1px solid var(--border)' }}>
          <input
            value={terminalDraft}
            onChange={event => setTerminalDraft(event.target.value)}
            placeholder={advancedMode ? 'Run a command' : 'Enable terminal to run commands'}
            disabled={!advancedMode}
            className="os-input"
          />
          <Button
            onClick={() => void sendTerminalInput()}
            disabled={!advancedMode || !terminal}
            disabledReason={!advancedMode ? 'Enable terminal access before running commands.' : !terminal ? 'Start a terminal before running commands.' : undefined}
          >
            Run
          </Button>
        </div>
      </section>

      <aside className="studio-code-logs">
        <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
          <strong>Deployment readiness</strong>
          <div style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'rgba(255,255,255,0.018)' }}>
            <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 700 }}>
              {deploymentConnector ? `Connected: ${deploymentConnector.name}` : 'Deployment not connected'}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.45 }}>
              {deploymentConnector
                ? 'Use the connected deployment app after lint, tests, build, and browser QA pass.'
                : 'Connect a deployment app or use the project pipeline after lint, tests, build, and browser QA pass.'}
            </div>
          </div>
          <div style={{ display: 'grid', gap: 5, color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.45 }}>
            <span>1. Stage test/build commands in the terminal.</span>
            <span>2. Review failures before release.</span>
            <span>3. Deploy only after browser QA confirms the changed route.</span>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
          <strong>Results</strong>
          {recentExecutions.length > 0 ? recentExecutions.map(execution => (
            <div key={execution.id} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'rgba(255,255,255,0.018)' }}>
              <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 700 }}>{execution.title}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{execution.status} | {execution.sourceType}</div>
            </div>
          )) : (
            <span style={{ color: 'var(--text-secondary)' }}>No developer execution results yet.</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
          <strong>Logs</strong>
          <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{events.length}</span>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {events.length > 0 ? events.slice(-16).reverse().map(event => (
            <div key={event.id} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'rgba(255,255,255,0.018)' }}>
              <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 700 }}>{event.type}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.45, wordBreak: 'break-word' }}>
                {summarizePayload(event.payload)}
              </div>
            </div>
          )) : (
            <span style={{ color: 'var(--text-secondary)' }}>Runtime logs will appear here.</span>
          )}
        </div>
      </aside>
    </div>
  );
}
