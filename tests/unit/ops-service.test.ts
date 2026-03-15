import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSupabase } from '../setup.js';
import { updateCrewSettings } from '../../src/ops/service.js';
import { ValidationError } from '../../src/utils/errors.js';

function createCrewSettingsQuery(initial: {
  scope: string;
  operation_mode: 'single_agent' | 'multi_agent';
  consensus_mode_enabled: boolean;
}) {
  const state = { ...initial };

  return {
    upsert: vi.fn((payload: Partial<typeof initial>, options?: { ignoreDuplicates?: boolean }) => {
      if (!(options?.ignoreDuplicates && state.scope === payload.scope)) {
        Object.assign(state, payload);
      }
      return Promise.resolve({ data: null, error: null });
    }),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(async () => ({ data: { ...state }, error: null })),
  };
}

describe('crew settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enables consensus only for multi-agent mode when FFP is enabled', async () => {
    process.env.FFP_MODE = 'enabled';
    const crewSettings = createCrewSettingsQuery({
      scope: 'global',
      operation_mode: 'single_agent',
      consensus_mode_enabled: false,
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'crew_settings') {
        return crewSettings;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const settings = await updateCrewSettings({
      operationMode: 'multi_agent',
      consensusModeEnabled: true,
    });

    expect(settings.operation_mode).toBe('multi_agent');
    expect(settings.consensus_mode_enabled).toBe(true);
  });

  it('rejects consensus mode when the requested operation mode is single-agent', async () => {
    process.env.FFP_MODE = 'enabled';
    const crewSettings = createCrewSettingsQuery({
      scope: 'global',
      operation_mode: 'multi_agent',
      consensus_mode_enabled: false,
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'crew_settings') {
        return crewSettings;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    await expect(updateCrewSettings({
      operationMode: 'single_agent',
      consensusModeEnabled: true,
    })).rejects.toThrow(ValidationError);
  });

  it('rejects consensus mode when deployment FFP mode is disabled', async () => {
    process.env.FFP_MODE = 'disabled';
    const crewSettings = createCrewSettingsQuery({
      scope: 'global',
      operation_mode: 'single_agent',
      consensus_mode_enabled: false,
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'crew_settings') {
        return crewSettings;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    await expect(updateCrewSettings({
      operationMode: 'multi_agent',
      consensusModeEnabled: true,
    })).rejects.toThrow(ValidationError);
  });
});

