import { describe, it } from 'vitest';
import { expectSourceContains } from './contract.js';

describe('mobile-parity', () => {
  it('keeps desktop-critical actions available in mobile navigation', () => {
    expectSourceContains(
      ['components', 'os', 'application-shell.tsx'],
      'Library',
      'Universal MCP',
      'FFP',
      'Open navigation',
      'Open context',
      'Sign Out',
    );
    expectSourceContains(['app', 'layout.tsx'], '<PanicButton />');
    expectSourceContains(['app', 'globals.css'], '.agentos-global-left', '.agentos-global-right', '@media (max-width: 767px)');
  });
});
