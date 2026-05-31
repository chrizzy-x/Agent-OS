import { describe, expect, it } from 'vitest';
import { ROUTE_CAPABILITY_POLICY } from '../../src/auth/route-policy.js';

describe('route capability policy', () => {
  it('keeps SDK and developer routes mapped to enterprise capabilities', () => {
    expect(ROUTE_CAPABILITY_POLICY['sdk.kernel']).toBe('access_sdk');
    expect(ROUTE_CAPABILITY_POLICY['sdk.credentials']).toBe('access_sdk');
    expect(ROUTE_CAPABILITY_POLICY['developer.console']).toBe('access_developer_console');
  });

  it('maps bearer issuance to use_bearer_token capability', () => {
    expect(ROUTE_CAPABILITY_POLICY['session.token.issue']).toBe('use_bearer_token');
  });
});
