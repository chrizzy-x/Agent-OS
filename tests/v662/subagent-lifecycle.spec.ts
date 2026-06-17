import { describe, it } from 'vitest';
import { expectRoute, expectSourceContains } from './contract.js';

describe('subagent-lifecycle', () => {
  it('treats subagents as private workspace assets with SUBAGENT_EXECUTION support', () => {
    expectRoute('app', 'api', 'subagents', 'route.ts');
    expectRoute('app', 'api', 'subagents', '[id]', 'route.ts');
    expectSourceContains(['src', 'execution', 'service.ts'], 'SUBAGENT_EXECUTION', 'subagent');
    expectSourceContains(['src', 'library', 'service.ts'], 'listAccessibleSubagents', 'subagent');
  });
});
