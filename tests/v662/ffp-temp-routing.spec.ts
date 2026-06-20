import { describe, it } from 'vitest';
import { expectFfpTempRouting, expectMigrationContains, expectRoute, expectSourceContains } from './contract.js';

describe('ffp-disabled-routing', () => {
  it('keeps FFP compatibility data while forcing execution bypass', () => {
    expectFfpTempRouting();
    expectRoute('app', 'api', 'ffp', 'temp', 'route.ts');
    expectMigrationContains('ffp_temp_settings');
    expectSourceContains(['components', 'pages', 'FfpPage.tsx'], 'FFP', 'The AgentOS Computer Layer', 'Coming Soon');
    expectSourceContains(['app', 'api', 'ffp', 'temp', 'route.ts'], 'METHOD_NOT_ALLOWED');
  });
});
