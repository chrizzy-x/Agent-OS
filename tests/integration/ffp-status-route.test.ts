import { beforeEach, describe, expect, it, vi } from 'vitest';

const routeMocks = vi.hoisted(() => ({
  getFFPClient: vi.fn(),
}));

vi.mock('../../src/ffp/client.js', () => ({
  getFFPClient: routeMocks.getFFPClient,
}));

import { GET } from '../../app/ffp/status/route.js';

describe('GET /ffp/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.getFFPClient.mockReturnValue({
      config: {
        enabled: true,
        chainId: 'chain-agentos',
        nodeUrl: 'https://ffp-node.example.com',
        requireConsensus: true,
      },
    });
  });

  it('returns the live FFP runtime status payload', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      enabled: true,
      chainId: 'chain-agentos',
      nodeUrl: 'https://ffp-node.example.com',
      requireConsensus: true,
    });
  });
});
