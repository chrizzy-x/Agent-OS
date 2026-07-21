import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { getPlanDescriptor, lockedControlReason } from '../../src/auth/capabilities.js';

describe('Phase 41 plans and access control', () => {
  it('exposes labels, limits, and upgrade paths for every AgentOS plan', () => {
    for (const plan of ['retail_free', 'retail_pro', 'enterprise_plus', 'enterprise_max'] as const) {
      const descriptor = getPlanDescriptor(plan);
      expect(descriptor.limits.length).toBeGreaterThan(0);
      expect(descriptor.upgradePath.length).toBeGreaterThan(0);
      expect(descriptor.priceUsd).toBe(0);
    }
  });

  it('keeps bearer token access out of Free and SDK publishing out of retail plans', () => {
    expect(lockedControlReason('retail_free', 'use_bearer_token')).toContain('Pro');
    expect(lockedControlReason('retail_free', 'access_sdk')).toContain('Enterprise Plus');
    expect(lockedControlReason('retail_pro', 'create_app')).toContain('Enterprise Plus');
    expect(lockedControlReason('enterprise_plus', 'access_sdk')).toBeNull();
  });

  it('surfaces locked controls and plan limits in user-facing pages', () => {
    const settings = readFileSync('components/pages/SettingsPage.tsx', 'utf8');
    const developer = readFileSync('components/pages/DeveloperConsolePage.tsx', 'utf8');
    expect(settings).toContain('Agent Credits: visible in compute telemetry');
    expect(settings).toContain('getPlanDescriptor(card.plan).limits');
    expect(developer).toContain('disabledReason={developerLockReason}');
    expect(developer).toContain('View plans');
  });
});
