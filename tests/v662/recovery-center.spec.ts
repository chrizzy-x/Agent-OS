import { describe, it } from 'vitest';
import { expectRoute, expectSourceContains } from './contract.js';

describe('recovery-center', () => {
  it('uses canonical execution actions for inspect, retry, resume, cancel, and rollback', () => {
    expectRoute('app', 'api', 'recovery', 'route.ts');
    expectRoute('app', 'api', 'executions', '[id]', 'actions', 'route.ts');
    expectSourceContains(['app', 'api', 'recovery', 'route.ts'], 'FAILED', 'PAUSED', 'CANCELLED');
    expectSourceContains(['src', 'execution', 'service.ts'], 'rollback', 'inspect', 'retry', 'cancel');
  });
});
