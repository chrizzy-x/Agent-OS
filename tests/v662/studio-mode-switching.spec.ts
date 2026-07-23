import { describe, it } from 'vitest';
import { buildStudioRoute, STUDIO_MODES } from '../../src/studio/modes.js';
import { expectRoute, expectSourceContains } from './contract.js';

describe('studio-mode-switching', () => {
  it('keeps NL, Primeflow, and Code Studio modes on one Studio shell', () => {
    expectRoute('components', 'studio', 'WorkflowStudioPanel.tsx');
    expectRoute('components', 'studio', 'CodeStudioPanel.tsx');
    expect(STUDIO_MODES.map(mode => mode.label)).toEqual(['NL Studio', 'Primeflow Builder', 'Code Studio']);
    expect(buildStudioRoute({
      mode: 'workflow',
      sessionId: 'session-1',
      projectId: 'project-1',
      workspaceId: 'workspace-1',
    })).toBe('/studio?mode=workflow&session=session-1&project=project-1&workspace=workspace-1');
    expectSourceContains(['components', 'studio', 'ModeSwitch.tsx'], 'STUDIO_MODES');
    expectSourceContains(['components', 'studio', 'StudioProvider.tsx'], 'ExecutionRecord');
    expectSourceContains(['components', 'studio', 'StudioProvider.tsx'], 'activeBootstrapModeRef');
  });
});
