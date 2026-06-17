import { describe, it } from 'vitest';
import { expectRoute, expectSourceContains } from './contract.js';

describe('memory-scope', () => {
  it('keeps memory searchable and scoped while supporting MEMORY_EXECUTION records', () => {
    expectRoute('app', 'api', 'memory', 'route.ts');
    expectSourceContains(['src', 'execution', 'service.ts'], 'MEMORY_EXECUTION');
    expectSourceContains(['app', 'api', 'search', 'route.ts'], 'listAccessibleMemoryEntries', 'memory');
  });
});
