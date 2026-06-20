import { describe, it } from 'vitest';
import { expectMigrationContains, expectRoute, expectSourceContains } from './contract.js';

describe('library-assets', () => {
  it('treats Library as the workspace ownership center for v6.6.4 asset kinds', () => {
    expectRoute('app', 'api', 'library', 'route.ts');
    expectMigrationContains('mcp_connection', 'external_connection', 'download', 'recent_activity');
    expectSourceContains(['src', 'library', 'service.ts'], 'installed_app', 'installed_skill', 'subagent', 'memory', 'vault_secret', 'connector');
    expectSourceContains(['components', 'pages', 'LibraryPage.tsx'], 'Apps', 'Skills', 'Subagents', 'Memory', 'Vault', 'Connectors');
  });
});
