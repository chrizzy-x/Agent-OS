import { describe, it } from 'vitest';
import { expectRoute, expectSourceContains } from './contract.js';

describe('profile-billing-upgrade', () => {
  it('moves profile, billing, tokens, and sign-out into Settings', () => {
    expectRoute('app', 'profile', 'page.tsx');
    expectSourceContains(
      ['components', 'pages', 'SettingsPage.tsx'],
      'Current Plan',
      'Subscription & Billing',
      'Upgrade',
      'Downgrade',
      'API Tokens',
      'Privacy & Security',
      'Sign Out Current Device',
      'Sign Out All Devices',
    );
  });
});
