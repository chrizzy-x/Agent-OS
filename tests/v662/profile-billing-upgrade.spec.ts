import { describe, it } from 'vitest';
import { expectRoute, expectSourceContains } from './contract.js';

describe('profile-billing-upgrade', () => {
  it('makes Settings the account center with visible billing and upgrade paths', () => {
    expectRoute('app', 'settings', 'page.tsx');
    expectSourceContains(
      ['components', 'pages', 'SettingsPage.tsx'],
      'Settings',
      'Current Plan',
      'Billing',
      'Subscription',
      'Upgrade Plan',
      'Bearer Tokens',
      'Developer / SDK',
      'Logout',
    );
  });
});
