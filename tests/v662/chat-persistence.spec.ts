import { describe, it } from 'vitest';
import { expectMigrationContains, expectSourceContains } from './contract.js';

describe('chat-persistence', () => {
  it('keeps chat executions and Studio messages durable across refresh', () => {
    expectMigrationContains('CHAT_EXECUTION', 'logs JSONB', 'agent_notifications_deeplink_idx');
    expectSourceContains(
      ['app', 'api', 'studio', 'intent', 'stream', 'route.ts'],
      'createExecution',
      'appendExecutionLog',
      'output: payload',
    );
  });
});
