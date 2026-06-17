'use client';

import Link from 'next/link';
import { Badge, Button } from '@/components/os/ui';
import { useStudio } from '@/components/studio/StudioProvider';

const FLOW = ['Trigger', 'Condition', 'Skill', 'App', 'Subagent', 'Output'];

export default function WorkflowStudioPanel() {
  const { workflows, currentProject, setComposerValue, sendMessage, sending } = useStudio();
  const active = workflows[0] ?? null;

  function prompt(action: string) {
    const text = `${action} workflow for ${currentProject?.name ?? 'this project'}${active ? ` using "${active.name}"` : ''}.`;
    setComposerValue(text);
    void sendMessage(text);
  }

  return (
    <div className="workflow-studio">
      <header className="workflow-toolbar">
        <div>
          <div className="nl-kicker">Workflow Studio</div>
          <h1>{active?.name ?? 'Workflow Studio'}</h1>
        </div>
        <div>
          <Button onClick={() => prompt('Run')} disabled={sending}>Run</Button>
          <Button variant="secondary" onClick={() => prompt('Test')} disabled={sending}>Test</Button>
          <Button variant="secondary" onClick={() => prompt('Deploy')} disabled={sending}>Deploy</Button>
          <Button variant="ghost" onClick={() => prompt('Show version history for')} disabled={sending}>Version History</Button>
        </div>
      </header>

      <section className="workflow-canvas" aria-label="Workflow canvas">
        {FLOW.map((node, index) => (
          <div key={node} className="workflow-node-wrap">
            <div className="workflow-node">
              <span>{node}</span>
              <strong>
                {node === 'Trigger' ? 'Manual / Schedule'
                  : node === 'Condition' ? 'Rules'
                    : node === 'Skill' ? 'Installed capability'
                      : node === 'App' ? 'Connected app'
                        : node === 'Subagent' ? 'Runtime owner'
                          : 'Result'}
              </strong>
            </div>
            {index < FLOW.length - 1 ? <div className="workflow-arrow">v</div> : null}
          </div>
        ))}
      </section>

      <aside className="workflow-list">
        <div className="agentos-context-title">Saved Workflows</div>
        {workflows.length === 0 ? (
          <div className="os-empty-body">No workflows yet.</div>
        ) : workflows.slice(0, 8).map(workflow => (
          <Link key={workflow.id} href={`/workflows/${workflow.id}`}>
            <span>{workflow.name}</span>
            <Badge tone={workflow.status === 'active' ? 'success' : 'warning'}>{workflow.status}</Badge>
          </Link>
        ))}
      </aside>

      <style>{`
        .workflow-studio {
          min-height: 0;
          height: 100%;
          display: grid;
          grid-template-rows: auto minmax(0, 1fr) auto;
          overflow: hidden;
        }

        .workflow-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 18px;
          border-bottom: 1px solid var(--border);
        }

        .workflow-toolbar h1 {
          margin: 0;
          font-size: 1.5rem;
          letter-spacing: 0;
        }

        .workflow-toolbar > div:last-child {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .workflow-canvas {
          min-height: 0;
          display: grid;
          align-content: center;
          justify-items: center;
          gap: 4px;
          padding: 18px;
          overflow: auto;
        }

        .workflow-node-wrap {
          display: grid;
          justify-items: center;
          gap: 4px;
        }

        .workflow-node {
          width: min(420px, 72vw);
          display: grid;
          gap: 4px;
          padding: 12px 14px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: rgba(255,255,255,0.025);
        }

        .workflow-node span {
          color: var(--text-primary);
          font-weight: 700;
        }

        .workflow-node strong {
          color: var(--text-secondary);
          font-size: 0.82rem;
          font-weight: 500;
        }

        .workflow-arrow {
          color: var(--text-tertiary);
          font-size: 1.1rem;
        }

        .workflow-list {
          display: grid;
          gap: 4px;
          padding: 10px 18px 14px;
          border-top: 1px solid var(--border);
        }

        .workflow-list a {
          min-height: 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 0 8px;
          border-radius: 6px;
          color: var(--text-secondary);
          text-decoration: none;
        }

        .workflow-list a:hover {
          color: var(--text-primary);
          background: rgba(255,255,255,0.035);
        }
      `}</style>
    </div>
  );
}
