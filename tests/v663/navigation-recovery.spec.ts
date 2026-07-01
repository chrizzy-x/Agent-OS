import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

function source(...parts: string[]) {
  return readFileSync(join(process.cwd(), ...parts), 'utf8');
}

describe('v6.6.3 navigation and workspace recovery', () => {
  it('mounts one persistent shell with required navigation and persisted sidebars', () => {
    const layout = source('app', 'layout.tsx');
    const shell = source('components', 'os', 'application-shell.tsx');
    expect(layout).toContain('<ApplicationShell>{children}</ApplicationShell>');
    for (const label of ['Home', 'Studio', 'Search', 'Tasks', 'Projects', 'Library', 'App Store', 'Skill Store', 'Subagents', 'Workflows', 'Memory', 'Vault', 'MCP', 'Developer', 'Community', 'FFP', 'Resources', 'Settings']) {
      expect(shell).toContain(`label: '${label}'`);
    }
    expect(shell).toContain('agentos.shell.leftCollapsed');
    expect(shell).toContain('agentos.shell.rightCollapsed');
    expect(shell).toContain('Pinned Sessions');
    expect(shell).toContain('Archived Sessions');
    expect(shell).toContain('Pinned Projects');
  });

  it('keeps Studio mode switching client-side and supports structured composer inputs', () => {
    const provider = source('components', 'studio', 'StudioProvider.tsx');
    const composer = source('components', 'studio', 'NLStudioPanel.tsx');
    expect(provider).toContain('initialBootstrapModeRef');
    expect(provider).toContain('attachments: composerAttachments');
    expect(provider).toContain('invocations: composerInvocations');
    expect(composer).toContain('Upload file');
    expect(composer).toContain('Upload image');
    expect(composer).toContain('SLASH_COMMANDS');
  });

  it('keeps SDK apps and external MCP agents separate', () => {
    expect(source('src', 'appstore', 'catalog.ts')).toContain("export type AgentAppSource = 'internal' | 'external_sdk'");
    expect(source('components', 'pages', 'McpDiagnosticsPage.tsx')).toContain('External MCP Registry');
    expect(source('app', 'api', 'agents', 'route.ts')).toContain('listExternalAgents');
  });

  it('restores project templates and subagent assignments', () => {
    const projects = source('components', 'pages', 'ProjectsPage.tsx');
    const subagents = source('components', 'pages', 'SubagentDetailPage.tsx');
    expect(projects).toContain("['research', 'Research']");
    expect(projects).toContain("['automation', 'Automation']");
    expect(projects).toContain('pinned: !item.pinned');
    expect(subagents).toContain('Workflow Assignment');
    expect(subagents).toContain('Memory Assignment');
    expect(subagents).toContain('Private Mode');
  });
});
