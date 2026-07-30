import { describe, expect, it } from 'vitest';
import {
  createNativeIntelligenceSelection,
  migrateLegacyExecutionTargetToIntelligenceSelection,
  normalizeIntelligenceSelection,
  type IntelligenceSelection,
} from '../../src/intelligence/selection.js';

describe('IntelligenceSelection contract', () => {
  it('keeps Native as the complete zero-connection selection', () => {
    expect(createNativeIntelligenceSelection()).toEqual({
      mode: 'native',
      connectionId: null,
      modelId: null,
      consensusConfigurationId: null,
      selectionSource: 'native_default',
    });
  });

  it('normalizes complete single and consensus selections without credentials', () => {
    const single: IntelligenceSelection = {
      mode: 'single',
      connectionId: 'connection-openai',
      modelId: 'gpt-5',
      consensusConfigurationId: null,
      selectionSource: 'message',
    };

    expect(normalizeIntelligenceSelection(single)).toEqual(single);
    expect(normalizeIntelligenceSelection({
      mode: 'consensus',
      connectionId: 'ignored',
      modelId: 'ignored',
      consensusConfigurationId: 'consensus-standard',
      selectionSource: 'workspace',
    })).toEqual({
      mode: 'consensus',
      connectionId: null,
      modelId: null,
      consensusConfigurationId: 'consensus-standard',
      selectionSource: 'workspace',
    });
  });

  it('falls back to Native when a connected or consensus selection is incomplete', () => {
    expect(normalizeIntelligenceSelection({ mode: 'single', connectionId: 'connection-openai' })).toEqual({
      mode: 'native',
      connectionId: null,
      modelId: null,
      consensusConfigurationId: null,
      selectionSource: 'native_default',
    });
    expect(normalizeIntelligenceSelection({ mode: 'consensus' }, 'session')).toEqual({
      mode: 'native',
      connectionId: null,
      modelId: null,
      consensusConfigurationId: null,
      selectionSource: 'session',
    });
  });

  it('migrates legacy target IDs without trusting provider-style IDs', () => {
    for (const legacy of [null, '', 'super_agentos', 'orchestrator', 'fallback', 'local_fallback', 'openai', 'anthropic']) {
      expect(migrateLegacyExecutionTargetToIntelligenceSelection(legacy)).toEqual({
        mode: 'native',
        connectionId: null,
        modelId: null,
        consensusConfigurationId: null,
        selectionSource: 'session',
      });
    }
  });

  it('migrates a legacy external provider only with an explicit connection and model mapping', () => {
    expect(migrateLegacyExecutionTargetToIntelligenceSelection('external_provider:openai')).toMatchObject({
      mode: 'native',
    });
    expect(migrateLegacyExecutionTargetToIntelligenceSelection('external_provider:openai', {
      selectionSource: 'workspace',
      connectionsByVendor: {
        openai: { connectionId: 'connection-1', modelId: 'gpt-5' },
      },
    })).toEqual({
      mode: 'single',
      connectionId: 'connection-1',
      modelId: 'gpt-5',
      consensusConfigurationId: null,
      selectionSource: 'workspace',
    });
  });
});
