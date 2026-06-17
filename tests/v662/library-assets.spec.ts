import { describe, it } from 'vitest';
import { expectMigrationContains, expectRoute, expectSourceContains } from './contract.js';

describe('library-assets', () => {
  it('treats Library as the workspace asset manager for all V6.6.2 asset kinds', () => {
    expectRoute('app', 'api', 'library', 'route.ts');
    expectMigrationContains('mcp_connection', 'external_connection', 'download', 'recent_activity');
    expectSourceContains(['src', 'library', 'service.ts'], 'installed_app', 'installed_skill', 'mcp_connection', 'external_connection', 'recent_activity');
    expectSourceContains(['components', 'pages', 'LibraryPage.tsx'], 'Install device');
  });
});
