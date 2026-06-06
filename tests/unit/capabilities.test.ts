import { describe, expect, it } from 'vitest';
import { assertCapability, getPlanDescriptor, hasCapability } from '../../src/auth/capabilities.js';
import { PermissionError } from '../../src/utils/errors.js';

describe('AgentOS capability matrix', () => {
  it('maps all plans as free while preserving capability boundaries', () => {
    expect(getPlanDescriptor('retail_free')).toMatchObject({ priceUsd: 0, enterprise: false });
    expect(getPlanDescriptor('retail_pro')).toMatchObject({ priceUsd: 0, enterprise: false });
    expect(getPlanDescriptor('enterprise_plus')).toMatchObject({ priceUsd: 0, enterprise: true });
    expect(getPlanDescriptor('enterprise_max')).toMatchObject({ priceUsd: 0, enterprise: true });
  });

  it('blocks retail from SDK, App, and Skill creation capabilities', () => {
    for (const plan of ['retail_free', 'retail_pro'] as const) {
      expect(hasCapability(plan, 'use_nl_studio')).toBe(true);
      expect(hasCapability(plan, 'create_private_workflow')).toBe(true);
      expect(hasCapability(plan, 'create_private_subagent')).toBe(true);
      expect(hasCapability(plan, 'create_skill')).toBe(false);
      expect(hasCapability(plan, 'create_app')).toBe(false);
      expect(hasCapability(plan, 'access_sdk')).toBe(false);
      expect(() => assertCapability(plan, 'create_app')).toThrow(PermissionError);
    }
  });

  it('enables bearer token access for retail_pro and disables it for retail_free', () => {
    expect(hasCapability('retail_free', 'use_bearer_token')).toBe(false);
    expect(hasCapability('retail_pro', 'use_bearer_token')).toBe(true);
  });

  it('does not accept legacy public plan identifiers for capability checks', () => {
    expect(hasCapability('free', 'use_nl_studio')).toBe(false);
    expect(hasCapability('hyper', 'access_sdk')).toBe(false);
  });

  it('allows Enterprise Plus and Max developer capabilities', () => {
    for (const plan of ['enterprise_plus', 'enterprise_max'] as const) {
      expect(hasCapability(plan, 'create_skill')).toBe(true);
      expect(hasCapability(plan, 'publish_skill')).toBe(true);
      expect(hasCapability(plan, 'create_app')).toBe(true);
      expect(hasCapability(plan, 'publish_app')).toBe(true);
      expect(hasCapability(plan, 'access_developer_console')).toBe(true);
      expect(hasCapability(plan, 'manage_manifest')).toBe(true);
    }
  });
});
