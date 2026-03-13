import { describe, it, expect } from 'vitest';
import { createAgentToken, verifyAgentToken, extractBearerToken } from '../../src/auth/agent-identity.js';
import { AuthError } from '../../src/utils/errors.js';

describe('createAgentToken + verifyAgentToken (round-trip)', () => {
  it('creates and verifies a token for an agent', () => {
    const token = createAgentToken('agent-42', {
      allowedDomains: ['api.openai.com'],
      expiresIn: '1h',
    });

    const ctx = verifyAgentToken(token);
    expect(ctx.agentId).toBe('agent-42');
    expect(ctx.allowedDomains).toContain('api.openai.com');
  });

  it('includes default quotas when none specified', () => {
    const token = createAgentToken('agent-defaults');
    const ctx = verifyAgentToken(token);
    expect(ctx.quotas.rateLimitPerMin).toBeGreaterThan(0);
    expect(ctx.quotas.storageQuotaBytes).toBeGreaterThan(0);
    expect(ctx.quotas.memoryQuotaBytes).toBeGreaterThan(0);
  });

  it('merges custom quotas over defaults', () => {
    const token = createAgentToken('agent-custom', {
      quotas: { rateLimitPerMin: 999 },
    });
    const ctx = verifyAgentToken(token);
    expect(ctx.quotas.rateLimitPerMin).toBe(999);
    // Other defaults still present
    expect(ctx.quotas.storageQuotaBytes).toBeGreaterThan(0);
  });

  it('throws AuthError for a tampered token', () => {
    const token = createAgentToken('agent-x');
    const tampered = token.slice(0, -5) + 'XXXXX';
    expect(() => verifyAgentToken(tampered)).toThrow(AuthError);
  });

  it('throws AuthError for an expired token', async () => {
    const token = createAgentToken('agent-expired', { expiresIn: 1 }); // 1 second
    await new Promise(r => setTimeout(r, 1100)); // wait for expiry
    expect(() => verifyAgentToken(token)).toThrow(AuthError);
  });

  it('throws AuthError for garbage input', () => {
    expect(() => verifyAgentToken('not.a.jwt')).toThrow(AuthError);
    expect(() => verifyAgentToken('')).toThrow(AuthError);
  });
});

describe('extractBearerToken', () => {
  it('extracts token from valid Authorization header', () => {
    const token = extractBearerToken('Bearer eyJhbGciOiJIUzI1NiJ9.test.sig');
    expect(token).toBe('eyJhbGciOiJIUzI1NiJ9.test.sig');
  });

  it('returns undefined for missing header', () => {
    expect(extractBearerToken(undefined)).toBeUndefined();
  });

  it('returns undefined for non-Bearer scheme', () => {
    expect(extractBearerToken('Basic dXNlcjpwYXNz')).toBeUndefined();
    expect(extractBearerToken('Token abc123')).toBeUndefined();
  });

  it('is case-insensitive for Bearer prefix', () => {
    const token = extractBearerToken('bearer mytoken');
    expect(token).toBe('mytoken');
  });
});
