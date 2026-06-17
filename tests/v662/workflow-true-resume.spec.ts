import { describe, it } from 'vitest';
import { expectMigrationContains, expectSourceContains } from './contract.js';

describe('workflow-true-resume', () => {
  it('requires a persisted checkpoint before reporting workflow resume success', () => {
    expectMigrationContains('agent_execution_checkpoints', 'pending_tool_calls', 'memory_state', 'node_position');
    expectSourceContains(
      ['src', 'execution', 'service.ts'],
      'Workflow resume requires a persisted execution checkpoint',
      'resumeCheckpoint',
      "status: nextStatusByAction[params.action]",
    );
  });
});
