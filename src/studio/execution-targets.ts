import type { VaultSecretMetadata } from '../vault/service.js';

export type NativeExecutionMode = 'super_agentos' | 'orchestrator';
export type ExternalProviderType = 'openai' | 'anthropic' | 'gemini';
export type ExecutionTargetType = 'super_agentos' | 'orchestrator' | 'external_provider' | 'prime_agent' | 'external_agent';
export type ExecutionTargetAvailability = 'available' | 'unavailable' | 'needs_connection' | 'expired' | 'revoked';
export type ExecutionFailurePolicy = 'resume_with_super_agentos' | 'stop_on_failure';

export type ExecutionTarget = {
  id: string;
  type: ExecutionTargetType;
  providerType?: ExternalProviderType;
  displayName: string;
  description: string;
  availability: ExecutionTargetAvailability;
  connectionStatus: 'native' | 'connected' | 'disconnected' | 'expired' | 'revoked';
  credentialReference: string | null;
  capabilities: string[];
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsFiles: boolean;
  supportsStructuredOutput: boolean;
  userSelectable: boolean;
  failurePolicy: ExecutionFailurePolicy;
};

export const SUPER_AGENTOS_TARGET_ID = 'super_agentos';
export const ORCHESTRATOR_TARGET_ID = 'orchestrator';

export const NATIVE_EXECUTION_TARGETS: ExecutionTarget[] = [
  {
    id: SUPER_AGENTOS_TARGET_ID,
    type: 'super_agentos',
    displayName: 'Super AgentOS',
    description: 'Native AgentOS intelligence',
    availability: 'available',
    connectionStatus: 'native',
    credentialReference: null,
    capabilities: ['context', 'memory', 'planning', 'tools', 'permissions', 'recovery', 'structured_output'],
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: false,
    supportsFiles: true,
    supportsStructuredOutput: true,
    userSelectable: true,
    failurePolicy: 'resume_with_super_agentos',
  },
  {
    id: ORCHESTRATOR_TARGET_ID,
    type: 'orchestrator',
    displayName: 'Orchestrator',
    description: 'Plans, delegates and executes',
    availability: 'available',
    connectionStatus: 'native',
    credentialReference: null,
    capabilities: ['planning', 'delegation', 'result_merging', 'validation', 'recovery'],
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: false,
    supportsFiles: true,
    supportsStructuredOutput: true,
    userSelectable: false,
    failurePolicy: 'resume_with_super_agentos',
  },
];

const PROVIDER_SECRET_NAMES: Record<ExternalProviderType, string[]> = {
  openai: ['OPENAI_API_KEY', 'OPENAI_PROVIDER_KEY', 'EXTERNAL_OPENAI_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY', 'ANTHROPIC_PROVIDER_KEY', 'EXTERNAL_ANTHROPIC_API_KEY'],
  gemini: ['GEMINI_API_KEY', 'GEMINI_PROVIDER_KEY', 'EXTERNAL_GEMINI_API_KEY'],
};

const PROVIDER_LABELS: Record<ExternalProviderType, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
};

function providerFromSecret(secret: VaultSecretMetadata): ExternalProviderType | null {
  const name = secret.name.toUpperCase();
  return (Object.entries(PROVIDER_SECRET_NAMES) as Array<[ExternalProviderType, string[]]>)
    .find(([, names]) => names.includes(name))?.[0] ?? null;
}

export function normalizeExecutionTargetId(value: unknown): string {
  const id = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!id || id === 'local_fallback' || id === 'fallback' || id === 'anthropic' || id === 'openai') return SUPER_AGENTOS_TARGET_ID;
  if (id === SUPER_AGENTOS_TARGET_ID || id === ORCHESTRATOR_TARGET_ID) return id;
  if (id.startsWith('external_provider:')) return id;
  return SUPER_AGENTOS_TARGET_ID;
}

export function buildExecutionTargets(params: {
  vaultSecrets?: VaultSecretMetadata[];
} = {}): ExecutionTarget[] {
  const externalTargets = new Map<ExternalProviderType, ExecutionTarget>();
  for (const secret of params.vaultSecrets ?? []) {
    const providerType = providerFromSecret(secret);
    if (!providerType) continue;
    if (secret.status !== 'active') continue;
    externalTargets.set(providerType, {
      id: `external_provider:${providerType}`,
      type: 'external_provider',
      providerType,
      displayName: PROVIDER_LABELS[providerType],
      description: 'Connected external intelligence',
      availability: 'available',
      connectionStatus: 'connected',
      credentialReference: secret.id,
      capabilities: ['reasoning', 'language', 'structured_output'],
      supportsStreaming: providerType !== 'gemini',
      supportsTools: false,
      supportsVision: providerType === 'openai' || providerType === 'gemini',
      supportsFiles: true,
      supportsStructuredOutput: true,
      userSelectable: true,
      failurePolicy: 'resume_with_super_agentos',
    });
  }
  return [...NATIVE_EXECUTION_TARGETS, ...externalTargets.values()];
}

export function resolveExecutionTarget(targets: ExecutionTarget[], selectedId: unknown): ExecutionTarget {
  const normalized = normalizeExecutionTargetId(selectedId);
  return targets.find(target => target.id === normalized && target.userSelectable && target.availability === 'available')
    ?? targets[0];
}
