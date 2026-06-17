import { describe, it } from 'vitest';
import { expectMigrationContains, expectSourceContains } from './contract.js';

describe('app-workspace-install', () => {
  it('separates workspace ownership from device deployment and caches packages', () => {
    expectMigrationContains('app_package_cache', 'app_device_installations');
    expectSourceContains(['src', 'appstore', 'service.ts'], 'workspaceInstalled', 'packageCachedForOfflineInstall', 'cacheAgentAppPackage');
    expectSourceContains(['src', 'actions', 'service.ts'], 'install_app', 'runTrackedExecution');
  });
});
