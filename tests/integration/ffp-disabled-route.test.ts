import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('../../src/auth/request.js', () => ({
  requireRouteCapability: vi.fn().mockResolvedValue({ agentId: 'agent-1' }),
}));
vi.mock('../../src/ffp/temp.js', () => ({
  getFfpTempSettings: vi.fn().mockResolvedValue({
    workspaceId: 'workspace-1',
    enabled: false,
    status: 'FFP Disabled',
    route: 'Multi-agent activities -> Unified Execution Engine',
    affectedExecutionTypes: [],
    bypassedExecutionTypes: [],
    updatedAt: null,
  }),
}));

import { GET, PATCH } from '../../app/api/ffp/temp/route.js';

describe('/api/ffp/temp disabled contract', () => {
  it('reports disabled state', async () => {
    const response = await GET(new NextRequest('http://localhost/api/ffp/temp'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ enabled: false, status: 'FFP Disabled' });
  });

  it('rejects activation', async () => {
    const response = await PATCH(new NextRequest('http://localhost/api/ffp/temp', {
      method: 'PATCH',
      body: JSON.stringify({ enabled: true }),
    }));
    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toMatchObject({ code: 'METHOD_NOT_ALLOWED' });
  });
});
