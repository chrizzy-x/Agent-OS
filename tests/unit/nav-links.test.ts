import { describe, expect, it } from 'vitest';
import { buildSessionNavLinks } from '../../components/Nav.js';
import type { BrowserSession } from '../../src/auth/browser-session.js';

describe('studio-first navigation links', () => {
  it('shows the locked signed-in top navigation', () => {
    const retailSession: BrowserSession = {
      agentName: 'Retail',
      plan: 'retail_free',
      planLabel: 'Free',
      accountType: 'retail',
      capabilities: ['use_nl_studio'],
      expiresAt: null,
    };

    const links = buildSessionNavLinks(retailSession);
    expect(links.map(item => item.label)).toEqual(['Search', 'Notifications', 'Profile']);
  });

  it('shows the same minimal unauthenticated navigation', () => {
    const links = buildSessionNavLinks(null);
    expect(links.map(item => item.label)).toEqual(['Search', 'Notifications', 'Profile']);
  });
});
