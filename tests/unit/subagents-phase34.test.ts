import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function source(...parts: string[]): string {
  return readFileSync(join(root, ...parts), 'utf8');
}

describe('Phase 34 subagents', () => {
  it('uses product-facing subagent labels and controls', () => {
    const detail = source('components', 'pages', 'SubagentDetailPage.tsx');
    const list = source('components', 'pages', 'SubagentsPage.tsx');

    expect(detail).toContain("return 'Incognito'");
    expect(detail).toContain("return 'Workflow'");
    expect(detail).toContain("return 'Public'");
    expect(list).toContain("return 'Incognito'");
    expect(list).toContain('Incognito Mode');
    expect(detail).toContain('Duplicate');
    expect(detail).toContain('Pause');
    expect(detail).toContain('Resume');
    expect(detail).toContain('Delete subagent');
  });

  it('exposes project, app, memory, and auth-safe management paths', () => {
    const detail = source('components', 'pages', 'SubagentDetailPage.tsx');
    const docs = source('docs', 'subagents.md');

    expect(detail).toContain('fetchBrowserSessionState');
    expect(detail).toContain('fetchWithBrowserSession');
    expect(detail).toContain('Project Assignment');
    expect(detail).toContain('Assign project');
    expect(detail).toContain('Attached apps');
    expect(detail).toContain("capabilityToken('app'");
    expect(detail).toContain('Memory scope: subagent namespace only');
    expect(detail).toContain('ConfirmationDialog');
    expect(docs).toContain('Incognito, Public, and Workflow');
    expect(docs).toContain('No fake apps, skills, memory, Vault assignments, permissions, workflows, or logs are displayed.');
  });
});
