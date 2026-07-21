import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'components/pages/SettingsPage.tsx'), 'utf8');

describe('phase 46 settings and user control', () => {
  it('covers the required settings areas', () => {
    [
      'Account',
      'Plan',
      'Credits',
      'Billing',
      'Memory',
      'Appearance',
      'Notifications',
      'Security',
      'Vault',
      'Connected Tools',
      'Developer Access',
      'Data & Privacy',
    ].forEach(label => expect(source).toContain(label));
  });

  it('keeps sensitive layers distinct and honest', () => {
    expect(source).toContain('Secrets are stored in Vault, not chat memory.');
    expect(source).toContain('SDK apps remain separate from MCP connections.');
    expect(source).toContain('Developer earnings stay separate from Agent Credits compute accounting.');
    expect(source).toContain('Account deletion backend is not connected yet.');
  });

  it('protects destructive settings actions with confirmation', () => {
    expect(source).toContain('confirmDestructiveAction');
    expect(source).toContain('Revoke this bearer token?');
    expect(source).toContain('Revoke this session?');
    expect(source).toContain('Sign out all devices?');
  });

  it('does not expose full developer console controls to retail users', () => {
    expect(source).toContain('Retail users see upgrade guidance only.');
    expect(source).toContain('Enterprise Plus or Enterprise Max is required for SDK publishing controls.');
  });
});
