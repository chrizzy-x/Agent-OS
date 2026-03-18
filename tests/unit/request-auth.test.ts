import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentToken } from '../../src/auth/agent-identity.js';
import { mockSupabase } from '../setup.js';
import {
  hasAdminAccess,
  hasAgentAccess,
  hasCronAccess,
  hasOpsAdminAccess,
  requireAgentContext,
  requireCronAccess,
  requireOpsAdminAccess,
} from '../../src/auth/request.js';
import { AuthError, PermissionError } from '../../src/utils/errors.js';

describe('request auth helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockReset();
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
  });

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

  it('grants ops admin access to agents flagged in metadata', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'ops-agent', metadata: { ops_admin: true } },
        error: null,
      }),
    });

    const headers = new Headers({ Authorization: `Bearer ${createAgentToken('ops-agent', { expiresIn: '1h' })}` });

    await expect(requireOpsAdminAccess(headers)).resolves.toBeUndefined();
    await expect(hasOpsAdminAccess(headers)).resolves.toBe(true);
  });

  it('rejects agents without ops admin metadata', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'basic-agent', metadata: { role: 'user' } },
        error: null,
      }),
    });

    const headers = new Headers({ Authorization: `Bearer ${createAgentToken('basic-agent', { expiresIn: '1h' })}` });

    await expect(requireOpsAdminAccess(headers)).rejects.toThrow(PermissionError);
    await expect(hasOpsAdminAccess(headers)).resolves.toBe(false);
  });
});
