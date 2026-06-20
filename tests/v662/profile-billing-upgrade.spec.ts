import { describe, it } from 'vitest';
import { expectRoute, expectSourceContains } from './contract.js';

describe('profile-billing-upgrade', () => {
  it('makes Profile the account center with visible billing and upgrade paths', () => {
    expectRoute('app', 'profile', 'page.tsx');
    expectSourceContains(
      ['components', 'pages', 'SettingsPage.tsx'],
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
