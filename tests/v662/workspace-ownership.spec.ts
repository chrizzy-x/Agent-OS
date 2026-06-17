import { describe, it } from 'vitest';
import { expectMigrationContains, expectSourceContains } from './contract.js';

describe('workspace-ownership', () => {
  it('keeps executions, library assets, tokens, package cache, and FFP settings workspace scoped', () => {
    expectMigrationContains('workspace_id', 'user_id', 'project_id', 'app_package_cache', 'ffp_temp_settings');
    expectSourceContains(['src', 'library', 'service.ts'], 'workspaceId', 'projectId');
    expectSourceContains(['src', 'auth', 'bearer-tokens.ts'], 'workspaceId', 'projectId');
  });
});
