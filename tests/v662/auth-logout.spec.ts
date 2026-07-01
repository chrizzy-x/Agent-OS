import { describe, it } from 'vitest';
import { expectRoute, expectSourceContains } from './contract.js';

describe('auth-logout', () => {
  it('exposes logout through session deletion, avatar menu, and settings security controls', () => {
    expectRoute('app', 'api', 'session', 'route.ts');
    expectSourceContains(['app', 'api', 'session', 'route.ts'], 'clearAgentSessionCookies');
    expectSourceContains(['components', 'os', 'application-shell.tsx'], 'destroyBrowserSession', 'Sign Out', 'Sign Out All Devices');
    expectSourceContains(['components', 'pages', 'SettingsPage.tsx'], 'destroyBrowserSession', 'router.replace', 'Sign Out Current Device');
  });
});
