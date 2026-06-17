import { describe, it } from 'vitest';
import { expectRoute, expectSourceContains } from './contract.js';

describe('appstore-lifecycle', () => {
  it('keeps app browse, install, open, update, remove, and device install on real routes', () => {
    expectRoute('app', 'api', 'apps', 'route.ts');
    expectRoute('app', 'api', 'apps', 'install', 'route.ts');
    expectRoute('app', 'api', 'apps', '[slug]', 'open', 'route.ts');
    expectRoute('app', 'api', 'apps', '[slug]', 'installation', 'route.ts');
    expectRoute('app', 'api', 'apps', '[slug]', 'device-install', 'route.ts');
    expectSourceContains(['src', 'appstore', 'service.ts'], 'installAgentApp', 'recordAgentAppOpen', 'updateAgentAppInstallation');
  });
});
