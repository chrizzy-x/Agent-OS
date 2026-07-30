import { describe, it } from 'vitest';
import { expectSourceContains } from '../v662/contract.js';

describe('Phase 22 Code Studio baseline', () => {
  it('keeps developer execution controls inside the Studio Code mode', () => {
    expectSourceContains(
      ['components', 'studio', 'CodeStudioPanel.tsx'],
      'Developer task',
      'Ask Super AgentOS',
      'Stage test',
      'Stage build',
      'Deployment readiness',
      'No developer execution results yet',
      'Project:',
      'terminalEventIcon',
      'RUN',
      'SYNC',
    );
  });
});
