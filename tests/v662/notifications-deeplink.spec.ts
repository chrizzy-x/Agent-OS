import { describe, it } from 'vitest';
import { expectMigrationContains, expectRoute, expectSourceContains } from './contract.js';

describe('notifications-deeplink', () => {
  it('keeps notifications tied to executions and exact sources', () => {
    expectRoute('app', 'api', 'notifications', 'route.ts');
    expectMigrationContains('agent_notifications_deeplink_idx', 'execution_id');
    expectSourceContains(['src', 'actions', 'service.ts'], 'deepLinkForAction', 'notificationId', 'deepLink');
  });
});
