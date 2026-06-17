import { describe, it } from 'vitest';
import { expectMigrationContains, expectRoute, expectSourceContains } from './contract.js';

describe('workflow-lifecycle', () => {
  it('runs workflow lifecycle actions through canonical execution records', () => {
    expectRoute('app', 'api', 'agent', 'workflows', 'route.ts');
    expectRoute('app', 'api', 'agent', 'workflows', '[id]', 'route.ts');
    expectMigrationContains('WORKFLOW_EXECUTION', 'agent_execution_checkpoints');
    expectSourceContains(['src', 'actions', 'service.ts'], 'runWorkflowNow', "type: 'WORKFLOW_EXECUTION'");
  });
});
