import { describe, expect, it } from 'vitest';
import { resolveBrowserAccessState } from '../../src/auth/browser-access.js';

describe('resolveBrowserAccessState', () => {
  it('returns expired when a known browser session cannot be refreshed', () => {
    expect(resolveBrowserAccessState(null, false, 'create_app', 'expired')).toBe('expired');
  });

  it('returns forbidden when the session lacks the required capability', () => {
    expect(resolveBrowserAccessState({ agentName: 'Agent', capabilities: ['read_only'], expiresAt: null }, false, 'create_app', 'active')).toBe('forbidden');
  });
});
