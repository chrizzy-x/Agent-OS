import { describe, expect, it } from 'vitest';
import { expectCanonicalExecutionContract, expectRoute, expectSourceContains } from './contract.js';

describe('super-agentos-basic-chat', () => {
  it('routes Studio chat through a persisted CHAT_EXECUTION without raw JSON status leakage', () => {
    expectCanonicalExecutionContract();
    expectRoute('app', 'api', 'studio', 'intent', 'stream', 'route.ts');
    expectSourceContains(
      ['app', 'api', 'studio', 'intent', 'stream', 'route.ts'],
      "type: 'CHAT_EXECUTION'",
      "status: 'RUNNING'",
      "'COMPLETED'",
      'createNotification',
    );
  });
});
