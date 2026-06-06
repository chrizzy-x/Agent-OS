import { describe, expect, it } from 'vitest';
import { withStudioDefaultAllowedDomains } from '../../src/studio/domains.js';

describe('withStudioDefaultAllowedDomains', () => {
  it('adds Studio public API domains without dropping agent domains', () => {
    const context = withStudioDefaultAllowedDomains({
      agentId: 'agent-1',
      allowedDomains: ['api.example.com', 'API.COINGECKO.COM'],
      quotas: {
        storageQuotaBytes: 1,
        memoryQuotaBytes: 1,
        rateLimitPerMin: 1,
      },
      tier: 'retail_free',
    });

    expect(context.allowedDomains).toEqual([
      'api.example.com',
      'api.coingecko.com',
      'api.open-meteo.com',
    ]);
  });
});
