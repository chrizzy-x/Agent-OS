import { describe, expect, it } from 'vitest';
import { buildSessionNavLinks } from '../../components/Nav.js';
import type { BrowserSession } from '../../src/auth/browser-session.js';

describe('studio-first navigation links', () => {
  it('shows the simplified signed-in top navigation', () => {
    const retailSession: BrowserSession = {
      agentName: 'Retail',
      plan: 'retail_free',
      planLabel: 'Retail Free',
      accountType: 'retail',
      capabilities: ['use_nl_studio'],
      expiresAt: null,
    };

    const links = buildSessionNavLinks(retailSession);
    expect(links.map(item => item.label)).toEqual(['Studio', 'Appstore', 'Developer', 'Settings']);
  });

  it('keeps the same top-level navigation for enterprise sessions', () => {
    const enterpriseSession: BrowserSession = {
      agentName: 'Enterprise',
      plan: 'enterprise_plus',
      planLabel: 'Enterprise Plus',
      accountType: 'enterprise',
      capabilities: ['use_nl_studio', 'access_developer_console', 'access_sdk'],
      expiresAt: null,
    };

    const links = buildSessionNavLinks(enterpriseSession);
    expect(links.map(item => item.label)).toEqual(['Studio', 'Appstore', 'Developer', 'Settings']);
  });

  it('shows a minimal unauthenticated navigation', () => {
    const links = buildSessionNavLinks(null);
    expect(links.map(item => item.label)).toEqual(['Appstore']);
  });
});
