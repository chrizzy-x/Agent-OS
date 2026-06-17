import { describe, it } from 'vitest';
import { expectRoute, expectSourceContains } from './contract.js';

describe('file-lifecycle', () => {
  it('keeps file actions routed through backend file APIs and FILE_EXECUTION support', () => {
    expectRoute('app', 'api', 'files', 'route.ts');
    expectSourceContains(['src', 'execution', 'service.ts'], 'FILE_EXECUTION');
    expectSourceContains(['src', 'library', 'service.ts'], 'listAccessibleFiles', 'file');
  });
});
