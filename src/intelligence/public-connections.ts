import { getKnownIntelligenceModels, type ConnectedIntelligenceModel } from './adapters.js';
import type { IntelligenceConnectionRecord, IntelligenceVendor } from './service.js';

const MAX_PUBLIC_STORED_MODELS = 40;

function uniqueModelIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    const value = id.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

export function compactPublicModelIds(params: {
  vendor: IntelligenceVendor;
  selectedModelId: string;
  availableModels: string[];
}): string[] {
  const known = getKnownIntelligenceModels(params.vendor).map(model => model.id);
  return uniqueModelIds([
    params.selectedModelId,
    ...known,
    ...params.availableModels.slice(0, MAX_PUBLIC_STORED_MODELS),
  ]);
}

export function compactPublicCapabilities(params: {
  vendor: IntelligenceVendor;
  selectedModelId: string;
  availableModels: string[];
  capabilities: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    ...params.capabilities,
    models: compactPublicModelIds(params),
  };
}

export function safePublicIntelligenceConnection(
  connection: IntelligenceConnectionRecord,
): Omit<IntelligenceConnectionRecord, 'vaultSecretId'> {
  const availableModels = compactPublicModelIds({
    vendor: connection.vendor,
    selectedModelId: connection.selectedModelId,
    availableModels: connection.availableModels,
  });
  return {
    id: connection.id,
    ownerAgentId: connection.ownerAgentId,
    workspaceId: connection.workspaceId,
    vendor: connection.vendor,
    displayName: connection.displayName,
    status: connection.status,
    selectedModelId: connection.selectedModelId,
    availableModels,
    capabilities: compactPublicCapabilities({
      vendor: connection.vendor,
      selectedModelId: connection.selectedModelId,
      availableModels: connection.availableModels,
      capabilities: connection.capabilities,
    }),
    health: connection.health,
    lastValidatedAt: connection.lastValidatedAt,
    lastError: connection.lastError,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

export function publicKnownModelsByVendor(vendor?: IntelligenceVendor): Record<string, ConnectedIntelligenceModel[]> {
  const models = getKnownIntelligenceModels(vendor);
  return models.reduce<Record<string, ConnectedIntelligenceModel[]>>((acc, model) => {
    acc[model.vendor] ??= [];
    acc[model.vendor].push(model);
    return acc;
  }, {});
}
