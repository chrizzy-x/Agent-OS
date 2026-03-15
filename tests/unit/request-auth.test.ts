import { describe, expect, it } from 'vitest';
import { createAgentToken } from '../../src/auth/agent-identity.js';
import {
  hasAdminAccess,
  hasAgentAccess,
  hasCronAccess,
  requireAgentContext,
  requireCronAccess,
} from '../../src/auth/request.js';
import { AuthError } from '../../src/utils/errors.js';

describe('request auth helpers', () => {
  it('derives the agent identity from the bearer token, not from arbitrary headers', () => {
    const token = createAgentToken('agent-from-jwt', { expiresIn: '1h' });
    const headers = new Headers({
      Authorization: `Bearer ${token}`,
      'X-Agent-ID': 'forged-agent-id',
    });

    const ctx = requireAgentContext(headers);
    expect(ctx.agentId).toBe('agent-from-jwt');
  });

  it('recognizes valid agent bearer tokens', () => {
    const token = createAgentToken('agent-from-jwt', { expiresIn: '1h' });
    const headers = new Headers({ Authorization: `Bearer ${token}` });

    expect(hasAgentAccess(headers)).toBe(true);
  });

  it('rejects invalid agent bearer tokens', () => {
    const headers = new Headers({ Authorization: 'Bearer not-a-real-token' });
    expect(hasAgentAccess(headers)).toBe(false);
  });

  it('recognizes the configured admin token', () => {
    const headers = new Headers({ Authorization: `Bearer ${process.env.ADMIN_TOKEN}` });
    expect(hasAdminAccess(headers)).toBe(true);
  });

  it('accepts vercel cron requests when a cron secret exists', () => {
    const headers = new Headers({ 'x-vercel-cron': '1' });
    expect(hasCronAccess(headers)).toBe(true);
  });

  it('rejects missing bearer tokens for agent auth', () => {
    expect(() => requireAgentContext(new Headers())).toThrow(AuthError);
  });

  it('rejects cron requests without an allowed token or cron signal', () => {
    expect(() => requireCronAccess(new Headers())).toThrow(AuthError);
  });
});
