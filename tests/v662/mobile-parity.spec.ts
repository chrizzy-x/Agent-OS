import { describe, it } from 'vitest';
import { expectSourceContains } from './contract.js';

describe('mobile-parity', () => {
  it('keeps desktop-critical actions available in mobile navigation', () => {
    expectSourceContains(
      ['components', 'Nav.tsx'],
      'MOBILE_MORE_LINKS',
      'Library',
      'Universal MCP',
      'FFP (temp)',
      'Profile',
      'Logout',
    );
    expectSourceContains(['app', 'layout.tsx'], '<PanicButton />');
    expectSourceContains(['app', 'globals.css'], '.panic-button', 'top: 8px', 'right: 12px');
  });
});
