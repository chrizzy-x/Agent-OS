'use client';

import Nav from '@/components/Nav';
import { Drawer } from '@/components/os/overlays';
import { Badge, Button } from '@/components/os/ui';
import CodeStudioPanel from '@/components/studio/CodeStudioPanel';
import NLStudioPanel from '@/components/studio/NLStudioPanel';
import StudioContextDrawer from '@/components/studio/StudioContextDrawer';
import { useStudio } from '@/components/studio/StudioProvider';
import StudioSidebar from '@/components/studio/StudioSidebar';
import StudioTopbar from '@/components/studio/StudioTopbar';
import WorkflowStudioPanel from '@/components/studio/WorkflowStudioPanel';
import type { StudioContextSection } from '@/src/studio/types';

function StudioContextPanel() {
  const {
    installedApps,
    installedSkills,
    workflows,
    subagents,
    memoryEntries,
    vaultSecrets,
    currentProject,
    activeSubagent,
    executions,
    openContext,
  } = useStudio();

  return (
    <aside className="studio-context-desktop">
      <div className="agentos-context-panel">
        <div className="agentos-context-title">Context</div>
        <div className="agentos-context-rows">
          <div><span>Apps</span><strong>{installedApps.length}</strong></div>
          <div><span>Skills</span><strong>{installedSkills.length}</strong></div>
          <div><span>Workflows</span><strong>{workflows.length}</strong></div>
          <div><span>Subagents</span><strong>{subagents.length}</strong></div>
          <div><span>Memory</span><strong>{memoryEntries.length ? 'Active' : 'Idle'}</strong></div>
          <div><span>Vault</span><strong>{vaultSecrets.length ? 'Secure' : 'Ready'}</strong></div>
          <div><span>MCP</span><strong>8</strong></div>
          <div><span>FFP</span><strong>Healthy</strong></div>
        </div>
        <div className="agentos-context-title">Active</div>
        <div className="agentos-context-rows">
          <div><span>Current Project</span><strong>{currentProject?.name ?? 'Default'}</strong></div>
          <div><span>Current Workflow</span><strong>{workflows[0]?.name ?? 'None'}</strong></div>
          <div><span>Current App</span><strong>{installedApps[0]?.name ?? 'None'}</strong></div>
          <div><span>Current Skill</span><strong>{installedSkills[0]?.name ?? 'None'}</strong></div>
          <div><span>Running Tasks</span><strong>{executions.filter(item => ['QUEUED', 'RUNNING', 'PAUSED'].includes(item.status)).length}</strong></div>
        </div>
        <div className="agentos-context-title">Open</div>
        <div className="agentos-context-list">
          {[
            ['Apps', 'apps'],
            ['Skills', 'skills'],
            ['Workflows', 'workflows'],
            ['Subagents', 'subagents'],
            ['Memory', 'memory'],
            ['Vault', 'vault'],
            ['Logs', 'logs'],
          ].map(([label, section]) => (
            <button key={label} type="button" onClick={() => openContext(section as StudioContextSection)}>
              <span>{label}</span>
              <Badge tone="default">{activeSubagent ? activeSubagent.name : 'Super'}</Badge>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

export default function StudioShell() {
  const { loading, browserSession, mode, sidebarOpen, setSidebarOpen } = useStudio();

  if (!browserSession && !loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        <Nav activePath="/studio" />
        <div style={{ minHeight: 'calc(100vh - 52px)', display: 'grid', placeItems: 'center', padding: 24 }}>
          <div style={{ maxWidth: 420, display: 'grid', gap: 14, textAlign: 'center' }}>
            <h1 style={{ margin: 0 }}>Super AgentOS</h1>
            <Button href="/signin">Sign in</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <Nav activePath="/studio" />
      <div className="studio-shell">
        <aside className="studio-sidebar-desktop">
          <StudioSidebar />
        </aside>
        <section className="studio-main">
          <StudioTopbar />
          <div className="studio-mode-body">
            {mode === 'code' ? <CodeStudioPanel /> : mode === 'workflow' ? <WorkflowStudioPanel /> : <NLStudioPanel />}
          </div>
        </section>
        <StudioContextPanel />
      </div>

      <Drawer
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        title="AgentOS"
        description="Chats, projects, Library, and more"
        size="md"
      >
        <StudioSidebar />
      </Drawer>
      <StudioContextDrawer />

      <style>{`
        .studio-shell {
          display: grid;
          grid-template-columns: 18% 62% 20%;
          overflow: hidden;
        }

        .studio-sidebar-desktop,
        .studio-context-desktop {
          min-width: 0;
          min-height: 0;
          border-color: var(--border);
          background: rgba(255,255,255,0.012);
          overflow: hidden;
        }

        .studio-sidebar-desktop {
          border-right: 1px solid var(--border);
        }

        .studio-context-desktop {
          border-left: 1px solid var(--border);
        }

        .studio-main {
          min-width: 0;
          min-height: 0;
          height: 100%;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .studio-mode-body {
          min-height: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .studio-mobile-only {
          display: none !important;
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

        .agentos-context-list button {
          min-height: 30px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 0 8px;
          border: 0;
          border-radius: 6px;
          background: transparent;
          color: var(--text-secondary);
          font-size: 0.78rem;
          cursor: pointer;
        }

        .agentos-context-list button:hover {
          color: var(--text-primary);
          background: rgba(255,255,255,0.035);
        }

        @media (max-width: 960px) {
          .studio-shell {
            grid-template-columns: minmax(0, 1fr);
          }

          .studio-sidebar-desktop,
          .studio-context-desktop {
            display: none;
          }

          .studio-mobile-only {
            display: inline-flex !important;
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
