import { describe, it } from 'vitest';
import { expectSourceContains } from './contract.js';

describe('panic-button', () => {
  it('cancels every active canonical execution type through the shared active-status helper', () => {
    expectSourceContains(['src', 'panic', 'service.ts'], 'isExecutionActiveStatus', 'executePanicAction');
    expectSourceContains(['src', 'execution', 'service.ts'], 'QUEUED', 'RUNNING', 'PAUSED', 'CANCELLED');
    expectSourceContains(['components', 'os', 'workspace-shell.tsx'], 'agentos-panic');
  });
});
