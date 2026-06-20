import { describe, it } from 'vitest';
import { expectSourceContains } from './contract.js';

describe('mobile-parity', () => {
  it('keeps desktop-critical actions available in mobile navigation', () => {
    expectSourceContains(
      ['components', 'os', 'application-shell.tsx'],
      'Home',
      'Studio',
      'Library',
      'Workflows',
      'Settings',
      'FFP',
      'agentos-mobile-primary-nav',
      'Logout',
    );
    expectSourceContains(['app', 'layout.tsx'], '<PanicButton />');
    expectSourceContains(['app', 'globals.css'], '.agentos-global-left', '.agentos-global-right', '@media (max-width: 767px)');
  });
});
