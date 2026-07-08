import { describe, expect, it } from 'vitest';
import {
  buildStudioRoute,
  normalizeStudioMode,
  STUDIO_MODES,
  studioModeInitialState,
} from '../../src/studio/modes.js';

describe('studio mode contract', () => {
  it('defines the three required Studio modes in product order', () => {
    expect(STUDIO_MODES.map(mode => mode.label)).toEqual(['NL Studio', 'Workflow Builder', 'Code Studio']);
    expect(STUDIO_MODES.map(mode => mode.key)).toEqual(['nl', 'workflow', 'code']);
  });

  it('normalizes unknown mode input to NL Studio', () => {
    expect(normalizeStudioMode('workflow')).toBe('workflow');
    expect(normalizeStudioMode('code')).toBe('code');
    expect(normalizeStudioMode('unknown')).toBe('nl');
    expect(normalizeStudioMode(null)).toBe('nl');
  });

  it('preserves workspace, project, and session context in Studio routes', () => {
    expect(buildStudioRoute({
      mode: 'code',
      sessionId: 'session-1',
      projectId: 'project-1',
      workspaceId: 'workspace-1',
    })).toBe('/studio?mode=code&session=session-1&project=project-1&workspace=workspace-1');
  });

  it('maps modes to backend session initial states', () => {
    expect(studioModeInitialState('nl')).toBe('NL_STUDIO');
    expect(studioModeInitialState('workflow')).toBe('WORKFLOW_STUDIO');
    expect(studioModeInitialState('code')).toBe('CODE_STUDIO');
  });
});
