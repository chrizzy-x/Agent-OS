'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/os/ui';
import CodeStudioPanel from '@/components/studio/CodeStudioPanel';
import NLStudioPanel from '@/components/studio/NLStudioPanel';
import StudioContextDrawer from '@/components/studio/StudioContextDrawer';
import { useStudio } from '@/components/studio/StudioProvider';
import StudioTopbar from '@/components/studio/StudioTopbar';
import WorkflowStudioPanel from '@/components/studio/WorkflowStudioPanel';

function ContextRow({ label, value }: { label: string; value: string | number }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function StudioRightPanel() {
  const {
    mode,
    session,
    currentProject,
    memoryEntries,
    fileEntries,
    installedSkills,
    installedApps,
    workflows,
    subagents,
    superAgent,
    executions,
    notifications,
    fileTree,
    terminal,
    lineage,
    events,
    openContext,
  } = useStudio();
  const running = executions.filter(item => ['QUEUED', 'RUNNING', 'PAUSED'].includes(item.status));
  const workflowRuns = executions.filter(item => item.sourceType === 'workflow');
  const runningAgents = subagents.filter(item => item.status === 'running' || running.some(run => run.sourceId === item.id));
  const idleAgents = subagents.filter(item => !runningAgents.some(runningAgent => runningAgent.id === item.id));

  return (
    <div className="studio-global-context">
      {mode === 'nl' ? (
        <>
          <section>
            <h2>NL Studio</h2>
            <ContextRow label="Session" value={session?.title ?? 'New chat'} />
            <ContextRow label="Memory" value={memoryEntries.length ? 'Active' : 'Idle'} />
            <ContextRow label="Pinned Context" value={(session?.linkedMemoryRefs?.length ?? 0) + (session?.linkedFilePaths?.length ?? 0)} />
            <ContextRow label="Uploaded Files" value={fileEntries.length} />
            <ContextRow label="Connected Skills" value={installedSkills.length} />
            <ContextRow label="Connected Apps" value={installedApps.length} />
            <ContextRow label="Connected MCPs" value="Universal MCP" />
            <ContextRow label="Running Tasks" value={running.length} />
          </section>
        </>
      ) : mode === 'workflow' ? (
        <section>
          <h2>Workflow Studio</h2>
          <ContextRow label="Nodes" value={workflows.length ? 'Available' : 0} />
          <ContextRow label="Triggers" value={workflows.filter(item => item.status === 'active').length} />
          <ContextRow label="Schedules" value={workflows.length} />
          <ContextRow label="Execution Status" value={running.length ? 'Running' : 'Idle'} />
          <ContextRow label="Recent Runs" value={workflowRuns.length} />
          <ContextRow label="Logs" value={events.length} />
        </section>
      ) : (
        <section>
          <h2>Code Studio</h2>
          <ContextRow label="Repository" value={currentProject?.name ?? 'No project'} />
          <ContextRow label="Files" value={fileTree.length} />
          <ContextRow label="Branches" value={lineage.children.length + (lineage.parent ? 1 : 0)} />
          <ContextRow label="Terminal" value={terminal?.status ?? 'Not started'} />
          <ContextRow label="Build Status" value="Not connected" />
          <ContextRow label="Deployments" value="Not connected" />
          <ContextRow label="Running Services" value={terminal?.status === 'running' ? 1 : 0} />
        </section>
      )}

      <section>
        <h2>Multi-Agent</h2>
        <ContextRow label="Super AgentOS" value={superAgent?.status ?? 'Active'} />
        <ContextRow label="Agentic Apps" value={installedApps.length} />
        <ContextRow label="External Agents" value="Universal MCP" />
        <ContextRow label="Workflow Agents" value={subagents.filter(item => session?.linkedWorkflowId && item.projectId === session.projectId).length} />
        <ContextRow label="Running Agents" value={runningAgents.length} />
        <ContextRow label="Idle Agents" value={idleAgents.length} />
      </section>

      <section>
        <h2>Execution</h2>
        <button type="button" onClick={() => { window.location.href = '/tasks'; }}>Task Center</button>
        <button type="button" onClick={() => openContext('recovery')}>Running Actions ({running.length})</button>
        <button type="button" onClick={() => openContext('logs')}>Logs</button>
        <button type="button" onClick={() => openContext('notifications')}>Approvals ({notifications.filter(item => item.type === 'approval_request' || item.type === 'approval_required').length})</button>
      </section>

      <section>
        <h2>Open</h2>
        <button type="button" onClick={() => openContext('memory')}>Memory</button>
        <button type="button" onClick={() => openContext('files')}>Files</button>
        <button type="button" onClick={() => openContext('notifications')}>Notifications ({notifications.filter(item => item.status === 'unread').length})</button>
      </section>
    </div>
  );
}

function StudioRightPortal() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTarget(document.getElementById('agentos-right-panel-slot'));
  }, []);
  return target ? createPortal(<StudioRightPanel />, target) : null;
}

export default function StudioShell() {
  const { loading, browserSession, mode } = useStudio();

  return (
    <div className="studio-shell-v663">
      <section className="studio-main">
        <StudioTopbar />
        <div className="studio-mode-body">
          {!browserSession && !loading ? (
            <div className="studio-signed-out">
              <h1>Super AgentOS</h1>
              <Button href="/signin">Sign in</Button>
            </div>
          ) : mode === 'code' ? <CodeStudioPanel /> : mode === 'workflow' ? <WorkflowStudioPanel /> : <NLStudioPanel />}
        </div>
      </section>
      <StudioRightPortal />
      <StudioContextDrawer />
      <style>{`
        .studio-shell-v663 {
          height: calc(100vh - 56px);
          height: calc(100dvh - 56px);
          min-height: 0;
          overflow: hidden;
        }

        .studio-main,
        .studio-mode-body {
          min-width: 0;
          min-height: 0;
          height: 100%;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .studio-mode-body {
          flex: 1;
        }

        .studio-signed-out {
          min-height: calc(100vh - 56px);
          display: grid;
          place-content: center;
          justify-items: center;
          gap: 14px;
        }

        .studio-global-context {
          display: grid;
          gap: 14px;
          padding-top: 2px;
        }

        .studio-global-context section {
          display: grid;
          gap: 5px;
        }

        .studio-global-context h2 {
          margin: 0 0 3px;
          color: var(--text-tertiary);
          font-family: var(--font-mono), monospace;
          font-size: 0.63rem;
          text-transform: uppercase;
        }

        .studio-global-context section > div {
          min-height: 31px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 0 8px;
          border-radius: 7px;
          background: rgba(255,255,255,0.025);
          color: var(--text-secondary);
          font-size: 0.71rem;
        }

        .studio-global-context strong {
          max-width: 150px;
          overflow: hidden;
          color: var(--text-primary);
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .studio-global-context button {
          min-height: 31px;
          padding: 0 8px;
          border: 0;
          border-radius: 7px;
          background: rgba(255,255,255,0.025);
          color: var(--text-secondary);
          text-align: left;
          cursor: pointer;
        }

        .studio-global-context button:hover {
          color: var(--text-primary);
          background: rgba(255,255,255,0.055);
        }

        .studio-code-layout {
          min-height: 0;
          height: 100%;
          display: grid;
          grid-template-columns: 210px minmax(0, 1fr) 250px;
          grid-template-rows: minmax(0, 1fr) 210px;
        }

        .studio-code-files,
        .studio-code-editor,
        .studio-code-terminal,
        .studio-code-logs {
          min-width: 0;
          min-height: 0;
          overflow: hidden;
        }

        .studio-code-files {
          grid-row: 1 / span 2;
          border-right: 1px solid var(--border);
          padding: 12px;
          overflow: auto;
        }

        .studio-code-editor {
          display: flex;
          flex-direction: column;
        }

        .studio-code-terminal {
          border-top: 1px solid var(--border);
          display: flex;
          flex-direction: column;
        }

        .studio-code-logs {
          grid-column: 3;
          grid-row: 1 / span 2;
          border-left: 1px solid var(--border);
          padding: 12px;
          overflow: auto;
        }

        @media (max-width: 767px) {
          .studio-shell-v663 {
            height: calc(100dvh - 52px);
          }

          .studio-code-layout {
            grid-template-columns: minmax(0, 1fr);
            grid-template-rows: 150px minmax(0, 1fr) 170px 150px;
          }

          .studio-code-files,
          .studio-code-logs {
            grid-column: auto;
            grid-row: auto;
            border-left: 0;
            border-right: 0;
            border-bottom: 1px solid var(--border);
          }
        }
      `}</style>
    </div>
  );
}
