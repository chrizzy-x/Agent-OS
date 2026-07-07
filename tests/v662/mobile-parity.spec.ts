import { describe, it } from 'vitest';
import { expect } from 'vitest';
import { expectSourceContains } from './contract.js';
import { NAVIGATION_SURFACES } from '../../src/product/surfaces.js';

describe('mobile-parity', () => {
  it('keeps desktop-critical actions available in mobile navigation', () => {
    expect(NAVIGATION_SURFACES.filter(surface => surface.mobileVisibility === 'drawer').map(surface => surface.label)).toEqual(expect.arrayContaining(['Library', 'Universal MCP', 'FFP']));
    expectSourceContains(['components', 'os', 'application-shell.tsx'], 'Open navigation', 'Open context', 'Sign Out');
    expectSourceContains(['app', 'layout.tsx'], '<PanicButton />');
    expectSourceContains(['app', 'globals.css'], '.agentos-global-left', '.agentos-global-right', '@media (max-width: 767px)');
  });
});
