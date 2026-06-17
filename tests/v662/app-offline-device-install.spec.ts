import { describe, it } from 'vitest';
import { expectMigrationContains, expectRoute, expectSourceContains } from './contract.js';

describe('app-offline-device-install', () => {
  it('installs compatible local devices from cached workspace packages', () => {
    expectRoute('app', 'api', 'apps', '[slug]', 'device-install', 'route.ts');
    expectMigrationContains('package_ref', 'target IN', "'android'", "'ios'", "'desktop'", "'pwa'");
    expectSourceContains(['src', 'appstore', 'service.ts'], 'installAgentAppToDevice', 'resolveSupportedDeviceTargets', 'packageCachedForOfflineInstall');
  });
});
