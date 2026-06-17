import { describe, expect, it } from 'vitest';

import { GET } from '../../app/ffp/status/route.js';

describe('GET /ffp/status', () => {
  it('returns the V6.6.2 FFP temp status payload', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      enabled: false,
      mode: 'temp',
      chainId: null,
      nodeUrl: null,
      requireConsensus: false,
      consensusAvailable: false,
      message: 'FFP is a temporary workspace routing layer in V6.6.2. No consensus engine is live.',
    });
  });
});
