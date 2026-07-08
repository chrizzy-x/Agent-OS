import { describe, expect, it } from 'vitest';
import { defaultPlanForAccountType, getSwitchablePlans, getUpgradeablePlans, parsePlanSelection, PLAN_LABELS } from '../../src/auth/tiers.js';

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

  it('names Enterprise Plus distinctly from Enterprise Max', () => {
    expect(PLAN_LABELS.enterprise_plus).toBe('Enterprise Plus');
    expect(PLAN_LABELS.enterprise_max).toBe('Enterprise Max');
  });

  it('defaults skipped selection to the selected account intent', () => {
    expect(defaultPlanForAccountType('retail')).toBe('retail_free');
    expect(defaultPlanForAccountType('enterprise')).toBe('enterprise_plus');
  });

  it('allows beta plan switching across retail and enterprise intent', () => {
    expect(getSwitchablePlans('enterprise_plus')).toEqual(['retail_free', 'retail_pro', 'enterprise_max']);
    expect(getSwitchablePlans('retail_free')).toEqual(['retail_pro', 'enterprise_plus', 'enterprise_max']);
  });
});
