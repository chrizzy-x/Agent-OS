import { beforeEach, describe, expect, it } from 'vitest';
import {
  getConsensusDefaultThreshold,
  getConsensusWaitMs,
  getPublicAppUrl,
  getSupabaseServiceRoleKey,
  isFfpEnabled,
} from '../../src/config/env.js';
import { ValidationError } from '../../src/utils/errors.js';

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
});

describe('env helpers', () => {
  it('prefers NEXT_PUBLIC_APP_URL for the public app URL', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://agent-os-one-eta.vercel.app';
    process.env.NEXT_PUBLIC_API_URL = 'https://legacy.example.com';
    expect(getPublicAppUrl()).toBe('https://agent-os-one-eta.vercel.app');
  });

  it('falls back to the legacy Supabase service key alias', () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_SERVICE_KEY = 'legacy-service-key';
    expect(getSupabaseServiceRoleKey()).toBe('legacy-service-key');
  });

  it('parses consensus wait and threshold values', () => {
    process.env.MCP_CONSENSUS_WAIT_MS = '4500';
    process.env.MCP_CONSENSUS_DEFAULT_THRESHOLD = '0.8';
    expect(getConsensusWaitMs()).toBe(4500);
    expect(getConsensusDefaultThreshold()).toBe(0.8);
  });

  it('rejects invalid consensus wait values', () => {
    process.env.MCP_CONSENSUS_WAIT_MS = '0';
    expect(() => getConsensusWaitMs()).toThrow(ValidationError);
  });

  it('rejects invalid consensus thresholds', () => {
    process.env.MCP_CONSENSUS_DEFAULT_THRESHOLD = '1.5';
    expect(() => getConsensusDefaultThreshold()).toThrow(ValidationError);
  });

  it('reports FFP mode from the environment', () => {
    process.env.FFP_MODE = 'enabled';
    expect(isFfpEnabled()).toBe(true);
    process.env.FFP_MODE = 'disabled';
    expect(isFfpEnabled()).toBe(false);
  });
});
