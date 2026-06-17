import { describe, it } from 'vitest';
import { expectMigrationContains, expectRoute, expectSourceContains } from './contract.js';

describe('project-context', () => {
  it('preserves project identity through execution, Library, and project routes', () => {
    expectMigrationContains('project_id');
    expectRoute('app', 'api', 'projects', 'route.ts');
    expectRoute('app', 'api', 'projects', '[id]', 'route.ts');
    expectSourceContains(['app', 'api', 'studio', 'intent', 'stream', 'route.ts'], 'projectId');
  });
});
