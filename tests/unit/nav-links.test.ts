import { describe, expect, it } from 'vitest';
import { buildSessionNavLinks } from '../../components/Nav.js';
import type { BrowserSession } from '../../src/auth/browser-session.js';

describe('studio-first navigation links', () => {
  it('shows retail navigation without enterprise-only surfaces', () => {
    const retailSession: BrowserSession = {
      agentName: 'Retail',
      plan: 'retail_free',
      planLabel: 'Retail Free',
      accountType: 'retail',
      capabilities: ['use_nl_studio'],
      expiresAt: null,
    };

    const links = buildSessionNavLinks(retailSession);
    expect(links.map(item => item.label)).toContain('Studio');
    expect(links.map(item => item.label)).toContain('Settings');
    expect(links.map(item => item.label)).not.toContain('Developer Console');
    expect(links.map(item => item.label)).not.toContain('SDK');
    expect(links.map(item => item.label)).not.toContain('Publishing');
    expect(links.map(item => item.label)).not.toContain('Team Management');
  });

  it('shows enterprise developer surfaces for enterprise sessions', () => {
    const enterpriseSession: BrowserSession = {
      agentName: 'Enterprise',
      plan: 'enterprise_plus',
      planLabel: 'Enterprise Plus',
      accountType: 'enterprise',
      capabilities: ['use_nl_studio', 'access_developer_console', 'access_sdk'],
      expiresAt: null,
    };

    const links = buildSessionNavLinks(enterpriseSession);
    expect(links.map(item => item.label)).toContain('Developer Console');
    expect(links.map(item => item.label)).toContain('SDK');
    expect(links.map(item => item.label)).toContain('Publishing');
    expect(links.map(item => item.label)).toContain('Team Management');
  });
});
