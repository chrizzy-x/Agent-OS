import { describe, it } from 'vitest';
import { expectRoute, expectSourceContains } from './contract.js';

describe('studio-mode-switching', () => {
  it('keeps NL, Workflow, and Code Studio modes on one Studio shell', () => {
    expectRoute('components', 'studio', 'WorkflowStudioPanel.tsx');
    expectRoute('components', 'studio', 'CodeStudioPanel.tsx');
    expectSourceContains(['components', 'studio', 'ModeSwitch.tsx'], 'NL Studio', 'Workflow Studio', 'Code Studio');
    expectSourceContains(['components', 'studio', 'StudioProvider.tsx'], 'ExecutionRecord');
  });
});
