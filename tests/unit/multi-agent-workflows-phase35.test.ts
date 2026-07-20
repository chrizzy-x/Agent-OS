import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function source(...parts: string[]): string {
  return readFileSync(join(root, ...parts), 'utf8');
}

describe('Phase 35 multi-agent workflow collaboration', () => {
  it('shows subagent roles, handoffs, output flow, and collaboration readiness', () => {
    const workflow = source('components', 'studio', 'WorkflowStudioPanel.tsx');

    expect(workflow).toContain('Multi-agent collaboration');
    expect(workflow).toContain('Subagent roles, handoffs, output flow, and scoped logs.');
    expect(workflow).toContain('workflow-collaboration-panel');
    expect(workflow).toContain('workflow-collaboration-item');
    expect(workflow).toContain('Role in workflow');
    expect(workflow).toContain('Handoff from');
    expect(workflow).toContain('Handoff to');
    expect(workflow).toContain('handoff ready');
    expect(workflow).toContain('needs subagent');
  });

  it('documents honest logging and privacy boundaries', () => {
    const docs = source('docs', 'multi-agent-workflows.md');

    expect(docs).toContain('No fake execution logs are generated in the builder.');
    expect(docs).toContain('Per-agent logs are shown from workflow run logs when execution data exists.');
    expect(docs).toContain('Incognito subagent context is not copied into public workflow metadata.');
    expect(docs).toContain('Vault secrets remain references');
  });
});
