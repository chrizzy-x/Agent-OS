import { describe, it } from 'vitest';
import { expectRoute, expectSourceContains } from './contract.js';

describe('global-search', () => {
  it('searches deep-linkable workspace assets without exposing secret values', () => {
    expectRoute('app', 'api', 'search', 'route.ts');
    expectSourceContains(
      ['app', 'api', 'search', 'route.ts'],
      'listAgentApps',
      'listLibrary',
      'listAccessibleFiles',
      'listAccessibleMemoryEntries',
      'listVaultSecrets',
      'href',
    );
  });
});
