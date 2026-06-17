import { describe, it } from 'vitest';
import { expectFfpTempRouting, expectMigrationContains, expectRoute, expectSourceContains } from './contract.js';

describe('ffp-temp-routing', () => {
  it('ships FFP as a temp toggle without consensus results', () => {
    expectFfpTempRouting();
    expectRoute('app', 'api', 'ffp', 'temp', 'route.ts');
    expectMigrationContains('ffp_temp_settings');
    expectSourceContains(['components', 'pages', 'FfpPage.tsx'], 'FFP temp', 'No consensus engine');
  });
});
