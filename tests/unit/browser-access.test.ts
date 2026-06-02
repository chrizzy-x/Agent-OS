import { describe, expect, it } from 'vitest';
import { resolveBrowserAccessState } from '../../src/auth/browser-access.js';

describe('resolveBrowserAccessState', () => {
  it('returns loading before session resolution completes', () => {
    expect(resolveBrowserAccessState(null, true, 'access_sdk')).toBe('loading');
  });

  it('returns signed_out when no session exists', () => {
    expect(resolveBrowserAccessState(null, false, 'access_sdk')).toBe('signed_out');
  });

  it('returns blocked when the session lacks the capability', () => {
    expect(resolveBrowserAccessState({
      agentName: 'Retail',
      capabilities: ['use_nl_studio'],
      expiresAt: null,
    }, false, 'access_sdk')).toBe('blocked');
  });

  it('returns allowed when the session has the capability', () => {
    expect(resolveBrowserAccessState({
      agentName: 'Enterprise',
      capabilities: ['access_sdk'],
      expiresAt: null,
    }, false, 'access_sdk')).toBe('allowed');
  });
});
