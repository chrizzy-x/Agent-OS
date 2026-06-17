import { describe, it } from 'vitest';
import { expectRoute, expectSourceContains } from './contract.js';

describe('auth-logout', () => {
  it('exposes logout through session deletion, profile, desktop nav, and mobile nav', () => {
    expectRoute('app', 'api', 'session', 'route.ts');
    expectSourceContains(['app', 'api', 'session', 'route.ts'], 'clearAgentSessionCookies');
    expectSourceContains(['components', 'Nav.tsx'], 'destroyBrowserSession', 'Logout');
    expectSourceContains(['components', 'pages', 'SettingsPage.tsx'], 'destroyBrowserSession', 'router.replace');
  });
});
