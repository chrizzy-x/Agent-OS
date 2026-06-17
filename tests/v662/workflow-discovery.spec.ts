import { describe, it } from 'vitest';
import { expectRoute, expectSourceContains } from './contract.js';

describe('workflow-discovery', () => {
  it('keeps workflow discovery/share/clone separate from monetization', () => {
    expectRoute('app', 'workflows', 'page.tsx');
    expectRoute('app', 'workflows', '[id]', 'page.tsx');
    expectSourceContains(['components', 'pages', 'LibraryPage.tsx'], 'saved_workflow');
    expectSourceContains(['src', 'library', 'service.ts'], 'published_asset', 'forked_asset');
  });
});
