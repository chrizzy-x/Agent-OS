import { afterEach, describe, expect, it } from 'vitest';
import { readLocalRuntimeState, updateLocalRuntimeState } from '../../src/storage/local-state.js';

const originalNodeEnv = process.env.NODE_ENV;
const originalAllowLocalState = process.env.AGENTOS_ALLOW_LOCAL_STATE;

describe('local runtime state safety', () => {
  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalAllowLocalState === undefined) delete process.env.AGENTOS_ALLOW_LOCAL_STATE;
    else process.env.AGENTOS_ALLOW_LOCAL_STATE = originalAllowLocalState;
  });

  it('returns an empty state instead of throwing when prod fallback reads are disabled', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AGENTOS_ALLOW_LOCAL_STATE;

    await expect(readLocalRuntimeState()).resolves.toMatchObject({
      accounts: {},
      agentApps: { catalog: [], installations: {} },
      vaultRuntimeGrants: [],
    });
  });

  it('still blocks local state writes in production when explicitly disabled', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AGENTOS_ALLOW_LOCAL_STATE;

    await expect(updateLocalRuntimeState(state => state)).rejects.toThrow('Local runtime state is disabled in production');
  });
});
