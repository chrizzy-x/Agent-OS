import { describe, expect, it } from 'vitest';
import { createSigninLookupHint, resolveSigninLookupHint } from '../../src/auth/signin-hint.js';

describe('signin lookup hints', () => {
  it('resolves a valid hint for the same normalized email', () => {
    const hint = createSigninLookupHint('agent_123', 'Proof@Example.Com', 1_000);

    expect(resolveSigninLookupHint(hint, 'proof@example.com', 2_000)).toBe('agent_123');
  });

  it('rejects tampered, mismatched, and expired hints', () => {
    const hint = createSigninLookupHint('agent_123', 'proof@example.com', 1_000);
    const parts = hint.split('.');
    const tampered = `${parts[0]}.${parts[1]}.bad`;

    expect(resolveSigninLookupHint(tampered, 'proof@example.com', 2_000)).toBeNull();
    expect(resolveSigninLookupHint(hint, 'other@example.com', 2_000)).toBeNull();
    expect(resolveSigninLookupHint(hint, 'proof@example.com', 1000 * 60 * 60 * 24 * 121)).toBeNull();
  });
});
