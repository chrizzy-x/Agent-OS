import { describe, expect, it } from 'vitest';
import { getUpgradeablePlans, parsePlanSelection } from '../../src/auth/tiers.js';

describe('beta plan tiers', () => {
  it('returns only higher plans for self-serve upgrades', () => {
    expect(getUpgradeablePlans('retail_free')).toEqual(['retail_pro', 'enterprise_plus', 'enterprise_max']);
    expect(getUpgradeablePlans('retail_pro')).toEqual(['enterprise_plus', 'enterprise_max']);
    expect(getUpgradeablePlans('enterprise_plus')).toEqual(['enterprise_max']);
    expect(getUpgradeablePlans('enterprise_max')).toEqual([]);
  });

  it('rejects mixed account-type plan selections', () => {
    expect(parsePlanSelection('retail', 'enterprise_plus')).toBeNull();
    expect(parsePlanSelection('enterprise', 'retail_pro')).toBeNull();
  });
});
