import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import {
  createIntelligenceConnection,
  listIntelligenceConnections,
  setIntelligenceDefault,
  updateIntelligenceConnectionStatus,
  type IntelligenceConnectionRecord,
  type IntelligenceVendor,
} from '@/src/intelligence/service';
import {
  discoverConnectedIntelligenceModels,
  getIntelligenceAdapter,
  getKnownIntelligenceModels,
  type ConnectedIntelligenceModel,
} from '@/src/intelligence/adapters';
import { createRuntimeSecretGrant, upsertVaultSecret } from '@/src/vault/service';
import { redactSecretsInString } from '@/src/security/secret-redaction';
import { toErrorResponse, ValidationError } from '@/src/utils/errors';

export const runtime = 'nodejs';

function parseVendor(value: unknown): IntelligenceVendor {
  const vendor = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (vendor === 'openai' || vendor === 'anthropic' || vendor === 'gemini') return vendor;
  throw new ValidationError('Unsupported intelligence vendor');
}

function safeConnection(connection: IntelligenceConnectionRecord) {
  return {
    id: connection.id,
    ownerAgentId: connection.ownerAgentId,
    workspaceId: connection.workspaceId,
    vendor: connection.vendor,
    displayName: connection.displayName,
    status: connection.status,
    selectedModelId: connection.selectedModelId,
    availableModels: connection.availableModels,
    capabilities: connection.capabilities,
    health: connection.health,
    lastValidatedAt: connection.lastValidatedAt,
    lastError: connection.lastError,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

function modelsByVendor(vendor?: IntelligenceVendor) {
  const models = getKnownIntelligenceModels(vendor);
  return models.reduce<Record<string, ConnectedIntelligenceModel[]>>((acc, model) => {
    acc[model.vendor] ??= [];
    acc[model.vendor].push(model);
    return acc;
  }, {});
}

function secretNameForVendor(vendor: IntelligenceVendor): string {
  return `SUPER_AGENTOS_${vendor.toUpperCase()}_KEY`;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'vault.manage');
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId')?.trim();
    if (!workspaceId) throw new ValidationError('workspaceId is required');

    const connections = await listIntelligenceConnections({
      ownerAgentId: ctx.agentId,
      workspaceId,
      includeRevoked: searchParams.get('includeRevoked') === '1',
    });

    return NextResponse.json({
      connections: connections.map(safeConnection),
      models: modelsByVendor(),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'vault.manage');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId.trim() : '';
    if (!workspaceId) throw new ValidationError('workspaceId is required');
    const vendor = parseVendor(body.vendor);
    const adapter = getIntelligenceAdapter(vendor);
    const credential = typeof body.credential === 'string' ? body.credential : '';
    if (!credential.trim()) throw new ValidationError('credential is required');

    const secret = await upsertVaultSecret({
      ownerAgentId: ctx.agentId,
      workspaceId,
      name: secretNameForVendor(vendor),
      value: credential,
    });

    let discoveredModels: ConnectedIntelligenceModel[] = [];
    let validationError: string | null = null;
    try {
      const grant = await createRuntimeSecretGrant({
        ownerAgentId: ctx.agentId,
        workspaceId,
        name: secret.name,
        expiresInMs: 60_000,
        metadata: { purpose: 'intelligence_connection_validation', vendor },
      });
      discoveredModels = await discoverConnectedIntelligenceModels({
        ownerAgentId: ctx.agentId,
        vaultRuntimeGrantId: grant.id,
        vendor,
      });
    } catch (error) {
      validationError = redactSecretsInString(error instanceof Error ? error.message : 'Credential validation failed');
    }

    const modelIds = (discoveredModels.length > 0 ? discoveredModels : adapter.knownModels).map(model => model.id);
    const requestedModel = typeof body.modelId === 'string' && body.modelId.trim() ? body.modelId.trim() : adapter.defaultModelId;
    const selectedModelId = modelIds.includes(requestedModel) ? requestedModel : modelIds[0] ?? adapter.defaultModelId;
    const active = validationError === null;
    const connection = await createIntelligenceConnection({
      ownerAgentId: ctx.agentId,
      workspaceId,
      vaultSecretId: secret.id,
      vendor,
      displayName: typeof body.displayName === 'string' && body.displayName.trim() ? body.displayName : `${vendor} connection`,
      selectedModelId,
      availableModels: modelIds,
      capabilities: { models: modelIds },
      status: active ? 'active' : 'invalid',
      lastError: validationError,
      validated: active,
    });

    if (active && body.makeDefault === true) {
      await setIntelligenceDefault({
        ownerAgentId: ctx.agentId,
        workspaceId,
        scope: 'workspace',
        selection: {
          mode: 'single',
          connectionId: connection.id,
          modelId: connection.selectedModelId,
          consensusConfigurationId: null,
          selectionSource: 'workspace',
        },
      });
    }

    return NextResponse.json({
      connection: safeConnection(connection),
      validated: active,
      validationError,
      models: modelIds,
    }, {
      status: active ? 201 : 202,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'vault.manage');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const connectionId = typeof body.connectionId === 'string' ? body.connectionId.trim() : '';
    if (!connectionId) throw new ValidationError('connectionId is required');
    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId.trim() : undefined;
    const action = typeof body.action === 'string' ? body.action : '';

    if (action === 'set_default') {
      const modelId = typeof body.modelId === 'string' && body.modelId.trim() ? body.modelId.trim() : null;
      if (!workspaceId) throw new ValidationError('workspaceId is required');
      if (!modelId) throw new ValidationError('modelId is required');
      const result = await setIntelligenceDefault({
        ownerAgentId: ctx.agentId,
        workspaceId,
        scope: 'workspace',
        selection: {
          mode: 'single',
          connectionId,
          modelId,
          consensusConfigurationId: null,
          selectionSource: 'workspace',
        },
      });
      return NextResponse.json({ default: result }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const status = action === 'revoke'
      ? 'revoked'
      : action === 'disable'
        ? 'disabled'
        : action === 'enable'
          ? 'active'
          : null;
    if (!status) throw new ValidationError('Unsupported connection action');

    const connection = await updateIntelligenceConnectionStatus({
      ownerAgentId: ctx.agentId,
      connectionId,
      workspaceId,
      status,
      selectedModelId: typeof body.modelId === 'string' && body.modelId.trim() ? body.modelId : undefined,
      validated: status === 'active',
      lastError: status === 'active' ? null : undefined,
    });
    return NextResponse.json({ connection: safeConnection(connection) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'vault.manage');
    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get('connectionId')?.trim();
    if (!connectionId) throw new ValidationError('connectionId is required');
    const connection = await updateIntelligenceConnectionStatus({
      ownerAgentId: ctx.agentId,
      connectionId,
      workspaceId: searchParams.get('workspaceId')?.trim() || undefined,
      status: 'revoked',
    });
    return NextResponse.json({ revoked: true, connection: safeConnection(connection) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
