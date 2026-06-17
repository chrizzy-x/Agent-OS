import { describe, it } from 'vitest';
import { expectRoute, expectSourceContains } from './contract.js';

describe('skill-lifecycle', () => {
  it('executes skill install, remove, and use through backend routes and tracked executions', () => {
    expectRoute('app', 'api', 'skills', 'install', 'route.ts');
    expectRoute('app', 'api', 'skills', 'uninstall', 'route.ts');
    expectRoute('app', 'api', 'skills', 'use', 'route.ts');
    expectSourceContains(['src', 'actions', 'service.ts'], 'install_skill', 'uninstall_skill', 'runTrackedExecution');
    expectSourceContains(['src', 'execution', 'service.ts'], 'SKILL_EXECUTION');
  });
});
