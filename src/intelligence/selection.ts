export type IntelligenceMode = 'native' | 'single' | 'consensus';

export type IntelligenceSelectionSource =
  | 'message'
  | 'session'
  | 'workspace'
  | 'user'
  | 'native_default';

export type IntelligenceSelection = {
  mode: IntelligenceMode;
  connectionId: string | null;
  modelId: string | null;
  consensusConfigurationId: string | null;
  selectionSource: IntelligenceSelectionSource;
};

export type LegacyIntelligenceConnection = {
  connectionId: string;
  modelId: string;
};

export type LegacyIntelligenceConnectionMap = Partial<Record<'openai' | 'anthropic' | 'gemini', LegacyIntelligenceConnection>>;

const INTELLIGENCE_MODES = new Set<IntelligenceMode>(['native', 'single', 'consensus']);
const SELECTION_SOURCES = new Set<IntelligenceSelectionSource>(['message', 'session', 'workspace', 'user', 'native_default']);

export const NATIVE_INTELLIGENCE_SELECTION: IntelligenceSelection = Object.freeze({
  mode: 'native',
  connectionId: null,
  modelId: null,
  consensusConfigurationId: null,
  selectionSource: 'native_default',
});

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function createNativeIntelligenceSelection(
  selectionSource: IntelligenceSelectionSource = 'native_default',
): IntelligenceSelection {
  return {
    mode: 'native',
    connectionId: null,
    modelId: null,
    consensusConfigurationId: null,
    selectionSource,
  };
}

export function normalizeIntelligenceSelection(
  value: unknown,
  fallbackSource: IntelligenceSelectionSource = 'native_default',
): IntelligenceSelection {
  if (!value || typeof value !== 'object') return createNativeIntelligenceSelection(fallbackSource);

  const input = value as Partial<IntelligenceSelection>;
  const mode = INTELLIGENCE_MODES.has(input.mode as IntelligenceMode) ? input.mode as IntelligenceMode : 'native';
  const selectionSource = SELECTION_SOURCES.has(input.selectionSource as IntelligenceSelectionSource)
    ? input.selectionSource as IntelligenceSelectionSource
    : fallbackSource;

  if (mode === 'single') {
    const connectionId = textValue(input.connectionId);
    const modelId = textValue(input.modelId);
    if (connectionId && modelId) {
      return {
        mode,
        connectionId,
        modelId,
        consensusConfigurationId: null,
        selectionSource,
      };
    }
    return createNativeIntelligenceSelection(selectionSource);
  }

  if (mode === 'consensus') {
    const consensusConfigurationId = textValue(input.consensusConfigurationId);
    if (consensusConfigurationId) {
      return {
        mode,
        connectionId: null,
        modelId: null,
        consensusConfigurationId,
        selectionSource,
      };
    }
    return createNativeIntelligenceSelection(selectionSource);
  }

  return createNativeIntelligenceSelection(selectionSource);
}
export function migrateLegacyExecutionTargetToIntelligenceSelection(
  executionTargetId: unknown,
  options: {
    selectionSource?: IntelligenceSelectionSource;
    connectionsByVendor?: LegacyIntelligenceConnectionMap;
  } = {},
): IntelligenceSelection {
  const selectionSource = options.selectionSource ?? 'session';
  const id = typeof executionTargetId === 'string' ? executionTargetId.trim().toLowerCase() : '';
  if (!id || id === 'super_agentos' || id === 'orchestrator' || id === 'local_fallback' || id === 'fallback') {
    return createNativeIntelligenceSelection(selectionSource);
  }

  const externalProvider = id.match(/^external_provider:(openai|anthropic|gemini)$/)?.[1] as keyof LegacyIntelligenceConnectionMap | undefined;
  const connection = externalProvider ? options.connectionsByVendor?.[externalProvider] : null;
  if (connection?.connectionId && connection.modelId) {
    return {
      mode: 'single',
      connectionId: connection.connectionId,
      modelId: connection.modelId,
      consensusConfigurationId: null,
      selectionSource,
    };
  }

  return createNativeIntelligenceSelection(selectionSource);
}
