import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const routeMocks = vi.hoisted(() => ({
  requireRouteCapability: vi.fn(),
  revokePermissionGrant: vi.fn(),
}));

vi.mock('../../src/auth/request.js', () => ({
  requireRouteCapability: routeMocks.requireRouteCapability,
}));

vi.mock('../../src/access/service.js', () => ({
  createPermissionGrant: vi.fn(),
  listPermissionGrants: vi.fn(),
  revokePermissionGrant: routeMocks.revokePermissionGrant,
}));

import { DELETE } from '../../app/api/permissions/grants/route.js';

describe('permissions grants route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.requireRouteCapability.mockResolvedValue({ agentId: 'agent-1' });
    routeMocks.revokePermissionGrant.mockResolvedValue({ id: 'grant-1', revokedAt: '2026-06-07T00:00:00Z' });
  });

  it('accepts grantId as the canonical revoke selector', async () => {
    const response = await DELETE(new NextRequest('http://localhost/api/permissions/grants?grantId=grant-1', {
      method: 'DELETE',
    }));

    expect(response.status).toBe(200);
    expect(routeMocks.revokePermissionGrant).toHaveBeenCalledWith({
      actorAgentId: 'agent-1',
      grantId: 'grant-1',
      workspaceId: null,
      sourceType: undefined,
      sourceId: undefined,
      targetType: undefined,
      targetId: undefined,
      permission: undefined,
    });
  });
});
