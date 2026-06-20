import { describe, expect, it } from 'vitest';

import { GET } from '../../app/ffp/status/route.js';

describe('GET /ffp/status', () => {
  it('returns the V6.6.4 disabled FFP status payload', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      enabled: false,
      mode: 'coming_soon',
      chainId: null,
      nodeUrl: null,
      requireConsensus: false,
      consensusAvailable: false,
      message: 'FFP is disabled and Coming Soon in AgentOS v6.6.4.',
    });
  });
});
