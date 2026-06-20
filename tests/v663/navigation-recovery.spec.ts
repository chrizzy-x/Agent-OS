import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

function source(...parts: string[]) {
  return readFileSync(join(process.cwd(), ...parts), 'utf8');
}

describe('v6.6.4 workspace architecture and navigation', () => {
  it('mounts one persistent shell with required navigation and persisted sidebars', () => {
    const layout = source('app', 'layout.tsx');
    const shell = source('components', 'os', 'application-shell.tsx');
    expect(layout).toContain('<ApplicationShell>{children}</ApplicationShell>');
    for (const label of ['Home', 'Studio', 'Projects', 'Workflows', 'Library', 'App Store', 'Developer', 'FFP', 'Settings']) {
      expect(shell).toContain(`label: '${label}'`);
    }
    expect(shell).toContain('Personal Workspace');
    expect(shell).toContain('AgentOS Workspace');
    expect(shell).toContain('deZypher Workspace');
    expect(shell).toContain('Derek Workspace');
    expect(shell).toContain('+ New Workspace');
    expect(shell).toContain('agentos.shell.leftCollapsed');
    expect(shell).toContain('agentos.shell.rightCollapsed');
    expect(shell).toContain('agentos-mobile-primary-nav');
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

  it('keeps SDK apps discoverable and external connections inside Library Connectors', () => {
    expect(source('src', 'appstore', 'catalog.ts')).toContain("export type AgentAppSource = 'internal' | 'external_sdk'");
    expect(source('components', 'pages', 'LibraryPage.tsx')).toContain('Connectors');
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
