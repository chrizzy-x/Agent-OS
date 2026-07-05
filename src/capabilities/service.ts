import crypto from 'crypto';
import { executeAgentOSAction } from '../actions/service.js';
import { logSuperAgentAudit } from '../audit/super-agent.js';
import type { AgentContext } from '../auth/permissions.js';
import { listInstalledAgentApps, type AgentAppOpenTarget } from '../appstore/service.js';
import { createConfirmation, evaluateConfirmationPolicy, getConfirmation, type RiskLevel } from '../confirmations/service.js';
import { runTrackedExecution } from '../execution/service.js';
import { listLibrary, type LibraryItem } from '../library/service.js';
import { executeUniversalToolCall, listUniversalMcpTools } from '../mcp/registry.js';
import { listProjects } from '../projects/service.js';
import { redactSecretsDeep } from '../security/secret-redaction.js';
import { runInstalledSkill } from '../skills/service.js';
import { readLocalRuntimeState, updateLocalRuntimeState } from '../storage/local-state.js';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { executeStudioCommand } from '../studio/service.js';
import { listAccessibleSubagents } from '../subagents/service.js';
import { appendAgentTaskStep, createAgentTask, getAgentTaskBundle, updateAgentTask, type AgentTaskRecord } from '../tasks/service.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { sanitizeOutput } from '../utils/output-sanitizer.js';
import { listVaultSecrets } from '../vault/service.js';

export type CapabilitySourceType = 'system' | 'app' | 'skill' | 'workflow' | 'subagent' | 'mcp' | 'project' | 'library';
export type CapabilityStatus = 'available' | 'needs_config' | 'disabled' | 'error';
export type CapabilityHealth = 'healthy' | 'warning' | 'unavailable' | 'deprecated' | 'failed' | 'disabled';

export type CapabilityAction = {
  id: string;
  capabilityId: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  executeEndpoint: string;
  confirmationRequired: boolean;
  riskLevel: RiskLevel;
  permissions: string[];
  timeoutMs: number;
  retryable: boolean;
};

export type CapabilityNode = {
  id: string;
  sourceType: CapabilitySourceType;
  sourceId: string;
  name: string;
  description: string;
  provider: string;
  version: string;
  status: CapabilityStatus;
  statusReason: string | null;
  health: CapabilityHealth;
  actions: CapabilityAction[];
  requiredPermissions: string[];
  requiredSecrets: Array<Record<string, unknown>>;
  dependencies: string[];
  costProfile: Record<string, unknown>;
  computeRequirement: Record<string, unknown>;
  supportedModels: string[];
  supportedContextTypes: string[];
  executionPriority: number;
  confidenceScore: number;
  fallbackCapabilities: string[];
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  metadata: Record<string, unknown>;
  contract: CapabilityContract;
  createdAt: string;
  updatedAt: string;
};

export type CapabilityContract = {
  capabilityId: string;
  capabilityName: string;
  description: string;
  provider: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  executionEndpoint: string | null;
  permissionRequirements: string[];
  dependencies: string[];
  estimatedCost: Record<string, unknown>;
  estimatedCompute: Record<string, unknown>;
  health: CapabilityHealth;
  version: string;
  supportedModels: string[];
  supportedContextTypes: string[];
  executionPriority: number;
  confidenceScore: number;
  fallbackCapabilities: string[];
};

export type RuntimeRegistryAsset = {
  assetId: string;
  workspaceId: string | null;
  assetType: CapabilitySourceType;
  name: string;
  description: string;
  provider: string;
  version: string;
  installationStatus: CapabilityStatus;
  healthStatus: CapabilityHealth;
  owner: string | null;
  permissions: string[];
  tags: string[];
  categories: string[];
  dependencies: string[];
  capabilitiesPublished: string[];
  lastUpdated: string;
  createdAt: string;
  runtimeMetadata: Record<string, unknown>;
};

export type CapabilityRelationship = {
  from: string;
  to: string;
  type: 'depends_on' | 'fallback_for' | 'extends' | 'replaces' | 'conflicts_with' | 'enhances' | 'consumes' | 'produces';
};

export type CapabilityGraph = {
  graphVersion: string;
  generatedAt: string;
  availableCapabilities: CapabilityNode[];
  unavailableCapabilities: CapabilityNode[];
  needsConfiguration: CapabilityNode[];
  registryAssets: RuntimeRegistryAsset[];
  relationships: CapabilityRelationship[];
  runtimeContract: {
    runtime: 'super-agentos';
    version: string;
    plannerVersion: string;
    registryVersion: string;
    selectionPolicy: 'deterministic-health-permission-rank';
  };
  summary: {
    total: number;
    available: number;
    needsConfiguration: number;
    disabled: number;
    error: number;
    registryAssets: number;
    healthy: number;
    warning: number;
    bySourceType: Record<CapabilitySourceType, number>;
  };
};

const RUNTIME_CONTRACT_VERSION = '6.6.8';
const PLANNER_VERSION = 'super-agentos-planner-v6.6.8';
const genericObjectSchema = { type: 'object', additionalProperties: true };
const emptyObjectSchema = { type: 'object', additionalProperties: false };

function localFallbackAllowed(): boolean {
  return process.env.NODE_ENV !== 'production';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function numberBetween(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function stableId(sourceType: CapabilitySourceType, sourceId: string): string {
  return `${sourceType}:${sourceId}`.replace(/\s+/g, '-').toLowerCase();
}

function action(params: Omit<CapabilityAction, 'capabilityId'> & { capabilityId?: string }): CapabilityAction {
  return {
    capabilityId: params.capabilityId ?? '',
    id: params.id,
    name: params.name,
    description: params.description,
    inputSchema: params.inputSchema,
    outputSchema: params.outputSchema,
    executeEndpoint: params.executeEndpoint,
    confirmationRequired: params.confirmationRequired,
    riskLevel: params.riskLevel,
    permissions: params.permissions,
    timeoutMs: params.timeoutMs,
    retryable: params.retryable,
  };
}

type CapabilityNodeInput = Omit<
  CapabilityNode,
  | 'createdAt'
  | 'updatedAt'
  | 'contract'
  | 'provider'
  | 'version'
  | 'health'
  | 'dependencies'
  | 'costProfile'
  | 'computeRequirement'
  | 'supportedModels'
  | 'supportedContextTypes'
  | 'executionPriority'
  | 'confidenceScore'
  | 'fallbackCapabilities'
> & Partial<Pick<
  CapabilityNode,
  | 'createdAt'
  | 'updatedAt'
  | 'provider'
  | 'version'
  | 'health'
  | 'dependencies'
  | 'costProfile'
  | 'computeRequirement'
  | 'supportedModels'
  | 'supportedContextTypes'
  | 'executionPriority'
  | 'confidenceScore'
  | 'fallbackCapabilities'
>>;

function healthForStatus(status: CapabilityStatus, value?: unknown): CapabilityHealth {
  if (value === 'healthy' || value === 'warning' || value === 'unavailable' || value === 'deprecated' || value === 'failed' || value === 'disabled') {
    return value;
  }
  if (status === 'available') return 'healthy';
  if (status === 'needs_config') return 'warning';
  if (status === 'disabled') return 'disabled';
  return 'failed';
}

function buildCapabilityContract(capability: Omit<CapabilityNode, 'contract'>): CapabilityContract {
  const executionEndpoint = capability.actions.find(item => item.executeEndpoint)?.executeEndpoint ?? null;
  return {
    capabilityId: capability.id,
    capabilityName: capability.name,
    description: capability.description,
    provider: capability.provider,
    inputs: capability.inputSchema,
    outputs: capability.outputSchema,
    executionEndpoint,
    permissionRequirements: capability.requiredPermissions,
    dependencies: capability.dependencies,
    estimatedCost: capability.costProfile,
    estimatedCompute: capability.computeRequirement,
    health: capability.health,
    version: capability.version,
    supportedModels: capability.supportedModels,
    supportedContextTypes: capability.supportedContextTypes,
    executionPriority: capability.executionPriority,
    confidenceScore: capability.confidenceScore,
    fallbackCapabilities: capability.fallbackCapabilities,
  };
}

function node(params: CapabilityNodeInput): CapabilityNode {
  const now = new Date().toISOString();
  const actions = params.actions.map(item => ({ ...item, capabilityId: params.id }));
  const metadata = params.metadata ?? {};
  const capability: Omit<CapabilityNode, 'contract'> = {
    ...params,
    provider: params.provider ?? (typeof metadata.provider === 'string' ? metadata.provider : params.sourceType),
    version: params.version ?? (typeof metadata.version === 'string' ? metadata.version : RUNTIME_CONTRACT_VERSION),
    health: healthForStatus(params.status, params.health ?? metadata.healthStatus),
    actions,
    dependencies: params.dependencies ?? stringArray(metadata.dependencies),
    costProfile: params.costProfile ?? asRecord(metadata.costProfile),
    computeRequirement: params.computeRequirement ?? asRecord(metadata.computeRequirement),
    supportedModels: params.supportedModels ?? stringArray(metadata.supportedModels),
    supportedContextTypes: params.supportedContextTypes ?? stringArray(metadata.supportedContextTypes),
    executionPriority: numberBetween(params.executionPriority ?? metadata.executionPriority, 0, 100, 50),
    confidenceScore: numberBetween(params.confidenceScore ?? metadata.confidenceScore, 0, 1, params.status === 'available' ? 0.9 : 0.4),
    fallbackCapabilities: params.fallbackCapabilities ?? stringArray(metadata.fallbackCapabilities),
    createdAt: params.createdAt ?? now,
    updatedAt: params.updatedAt ?? now,
  };
  return { ...capability, contract: buildCapabilityContract(capability) };
}

function normalizeStatus(value: unknown): CapabilityStatus {
  return value === 'available' || value === 'needs_config' || value === 'disabled' || value === 'error' ? value : 'available';
}

function normalizeRisk(value: unknown): RiskLevel {
  return value === 'medium' || value === 'high' || value === 'critical' ? value : 'low';
}

function mapCapability(row: Record<string, unknown>): CapabilityNode {
  const id = String(row.id);
  const metadata = asRecord(row.metadata);
  const rawActions = recordArray(row.actions).map(item => action({
    id: String(item.id ?? 'run'),
    capabilityId: id,
    name: String(item.name ?? item.id ?? 'Run'),
    description: String(item.description ?? ''),
    inputSchema: asRecord(item.inputSchema ?? item.input_schema),
    outputSchema: asRecord(item.outputSchema ?? item.output_schema),
    executeEndpoint: String(item.executeEndpoint ?? item.execute_endpoint ?? ''),
    confirmationRequired: item.confirmationRequired === true || item.confirmation_required === true,
    riskLevel: normalizeRisk(item.riskLevel ?? item.risk_level),
    permissions: stringArray(item.permissions),
    timeoutMs: Number(item.timeoutMs ?? item.timeout_ms ?? 30_000),
    retryable: item.retryable !== false,
  }));
  return node({
    id,
    sourceType: String(row.source_type ?? row.sourceType ?? 'system') as CapabilitySourceType,
    sourceId: String(row.source_id ?? row.sourceId ?? id),
    name: String(row.name ?? 'Capability'),
    description: String(row.description ?? ''),
    provider: String(row.provider ?? metadata.provider ?? row.source_type ?? row.sourceType ?? 'system'),
    version: String(row.version ?? metadata.version ?? RUNTIME_CONTRACT_VERSION),
    status: normalizeStatus(row.status),
    statusReason: typeof (row.status_reason ?? row.statusReason) === 'string' ? String(row.status_reason ?? row.statusReason) : null,
    health: healthForStatus(normalizeStatus(row.status), row.health_status ?? row.health ?? metadata.healthStatus),
    actions: rawActions,
    requiredPermissions: stringArray(row.required_permissions ?? row.requiredPermissions),
    requiredSecrets: recordArray(row.required_secrets ?? row.requiredSecrets),
    dependencies: stringArray(row.dependencies ?? metadata.dependencies),
    costProfile: asRecord(row.cost_profile ?? row.costProfile ?? metadata.costProfile),
    computeRequirement: asRecord(row.compute_requirement ?? row.computeRequirement ?? metadata.computeRequirement),
    supportedModels: stringArray(row.supported_models ?? row.supportedModels ?? metadata.supportedModels),
    supportedContextTypes: stringArray(row.supported_context_types ?? row.supportedContextTypes ?? metadata.supportedContextTypes),
    executionPriority: numberBetween(row.execution_priority ?? row.executionPriority ?? metadata.executionPriority, 0, 100, 50),
    confidenceScore: numberBetween(row.confidence_score ?? row.confidenceScore ?? metadata.confidenceScore, 0, 1, normalizeStatus(row.status) === 'available' ? 0.9 : 0.4),
    fallbackCapabilities: stringArray(row.fallback_capabilities ?? row.fallbackCapabilities ?? metadata.fallbackCapabilities),
    inputSchema: asRecord(row.input_schema ?? row.inputSchema),
    outputSchema: asRecord(row.output_schema ?? row.outputSchema),
    metadata,
    createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.updatedAt ?? new Date().toISOString()),
  });
}

function dedupe(nodes: CapabilityNode[]): CapabilityNode[] {
  const map = new Map<string, CapabilityNode>();
  for (const item of nodes) {
    map.set(item.id, item);
  }
  return [...map.values()].sort((left, right) => {
    if (left.status !== right.status) return left.status === 'available' ? -1 : right.status === 'available' ? 1 : left.status.localeCompare(right.status);
    return left.name.localeCompare(right.name);
  });
}

function runtimeRegistryAsset(capability: CapabilityNode): RuntimeRegistryAsset {
  const workspaceId = typeof capability.metadata.workspaceId === 'string' ? capability.metadata.workspaceId : null;
  return {
    assetId: capability.sourceId,
    workspaceId,
    assetType: capability.sourceType,
    name: capability.name,
    description: capability.description,
    provider: capability.provider,
    version: capability.version,
    installationStatus: capability.status,
    healthStatus: capability.health,
    owner: typeof capability.metadata.owner === 'string' ? capability.metadata.owner : null,
    permissions: capability.requiredPermissions,
    tags: stringArray(capability.metadata.tags),
    categories: [
      ...(typeof capability.metadata.category === 'string' ? [capability.metadata.category] : []),
      ...stringArray(capability.metadata.categories),
    ],
    dependencies: capability.dependencies,
    capabilitiesPublished: [capability.id],
    lastUpdated: capability.updatedAt,
    createdAt: capability.createdAt,
    runtimeMetadata: redactSecretsDeep({
      statusReason: capability.statusReason,
      actionCount: capability.actions.length,
      contract: capability.contract,
      ...capability.metadata,
    }) as Record<string, unknown>,
  };
}

function graphRelationships(nodes: CapabilityNode[]): CapabilityRelationship[] {
  return nodes.flatMap(item => [
    ...item.dependencies.map(dependency => ({ from: item.id, to: dependency, type: 'depends_on' as const })),
    ...item.fallbackCapabilities.map(fallback => ({ from: fallback, to: item.id, type: 'fallback_for' as const })),
  ]);
}

function graphVersion(nodes: CapabilityNode[], relationships: CapabilityRelationship[]): string {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify({
    version: RUNTIME_CONTRACT_VERSION,
    nodes: nodes.map(item => ({
      id: item.id,
      status: item.status,
      health: item.health,
      version: item.version,
      updatedAt: item.updatedAt,
      actions: item.actions.map(action => action.id),
    })),
    relationships,
  }));
  return `capgraph-${hash.digest('hex').slice(0, 16)}`;
}

function summarizeGraph(nodes: CapabilityNode[]): CapabilityGraph {
  const bySourceType: Record<CapabilitySourceType, number> = {
    system: 0,
    app: 0,
    skill: 0,
    workflow: 0,
    subagent: 0,
    mcp: 0,
    project: 0,
    library: 0,
  };
  for (const item of nodes) bySourceType[item.sourceType] += 1;
  const availableCapabilities = nodes.filter(item => item.status === 'available');
  const needsConfiguration = nodes.filter(item => item.status === 'needs_config');
  const unavailableCapabilities = nodes.filter(item => item.status !== 'available');
  const registryAssets = nodes.map(runtimeRegistryAsset);
  const relationships = graphRelationships(nodes);
  return {
    graphVersion: graphVersion(nodes, relationships),
    generatedAt: new Date().toISOString(),
    availableCapabilities,
    unavailableCapabilities,
    needsConfiguration,
    registryAssets,
    relationships,
    runtimeContract: {
      runtime: 'super-agentos',
      version: RUNTIME_CONTRACT_VERSION,
      plannerVersion: PLANNER_VERSION,
      registryVersion: RUNTIME_CONTRACT_VERSION,
      selectionPolicy: 'deterministic-health-permission-rank',
    },
    summary: {
      total: nodes.length,
      available: availableCapabilities.length,
      needsConfiguration: needsConfiguration.length,
      disabled: nodes.filter(item => item.status === 'disabled').length,
      error: nodes.filter(item => item.status === 'error').length,
      registryAssets: registryAssets.length,
      healthy: nodes.filter(item => item.health === 'healthy').length,
      warning: nodes.filter(item => item.health === 'warning').length,
      bySourceType,
    },
  };
}

export function createEmptyCapabilityGraph(): CapabilityGraph {
  return summarizeGraph([]);
}

async function listPersistedCapabilities(params: {
  ownerAgentId: string;
  workspaceId?: string | null;
}): Promise<CapabilityNode[]> {
  try {
    let query = getSupabaseAdmin()
      .from('capability_registry')
      .select('*')
      .eq('owner_agent_id', params.ownerAgentId)
      .order('updated_at', { ascending: false });
    if (params.workspaceId) query = query.eq('workspace_id', params.workspaceId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return ((data ?? []) as Record<string, unknown>[]).map(mapCapability);
  } catch (error) {
    if (!localFallbackAllowed()) throw error;
    const state = await readLocalRuntimeState();
    return state.capabilityRegistry
      .filter(item => String(item.owner_agent_id ?? item.ownerAgentId) === params.ownerAgentId)
      .filter(item => !params.workspaceId || String(item.workspace_id ?? item.workspaceId) === params.workspaceId)
      .map(mapCapability);
  }
}

function secretRefs(names: string[], availableSecrets: Set<string>): Array<Record<string, unknown>> {
  return [...new Set(names.map(name => name.trim()).filter(Boolean))].map(name => ({
    secretId: name,
    provider: name.split('_')[0]?.toLowerCase() || 'secret',
    scope: 'workspace',
    permissionRequirement: 'server-side runtime access',
    availabilityStatus: availableSecrets.has(name.toUpperCase()) ? 'available' : 'missing',
  }));
}

async function installedSkillNodes(params: {
  ownerAgentId: string;
  workspaceId?: string | null;
  availableSecrets: Set<string>;
}): Promise<CapabilityNode[]> {
  try {
    const supabase = getSupabaseAdmin();
    let installationQuery = supabase
      .from('skill_installations')
      .select('id,skill_id,workspace_id,status,permissions_approved,installed_at')
      .eq('agent_id', params.ownerAgentId)
      .neq('status', 'removed')
      .order('installed_at', { ascending: false });
    if (params.workspaceId) installationQuery = installationQuery.eq('workspace_id', params.workspaceId);
    const { data, error } = await installationQuery;
    if (error) throw new Error(error.message);

    const installations = (data ?? []) as Array<Record<string, unknown>>;
    const skillIds = [...new Set(installations.map(row => String(row.skill_id ?? '')).filter(Boolean))];
    if (skillIds.length === 0) return [];

    let skillResult: { data: unknown; error: { message: string } | null } = await supabase
      .from('skills')
      .select('id,name,slug,category,description,capabilities,permissions_required,required_secrets,inputs,outputs')
      .in('id', skillIds);
    if (skillResult.error) {
      skillResult = await supabase
        .from('skills')
        .select('id,name,slug,category,description,capabilities,permissions_required,required_secrets')
        .in('id', skillIds);
    }
    if (skillResult.error) throw new Error(skillResult.error.message);
    const skillById = new Map(((skillResult.data ?? []) as Array<Record<string, unknown>>).map(skill => [String(skill.id), skill]));

    return installations.flatMap(row => {
      const skill = skillById.get(String(row.skill_id ?? '')) ?? {};
      if (!skill.id) return [];
      const capabilityId = stableId('skill', String(skill.slug ?? skill.id));
      const caps = recordArray(skill.capabilities);
      const requiredSecrets = secretRefs(stringArray(skill.required_secrets), params.availableSecrets);
      const missingSecrets = requiredSecrets.filter(item => item.availabilityStatus === 'missing');
      const actions = caps.length > 0 ? caps.map(capability => {
        const actionId = String(capability.name ?? 'run').replace(/[^a-zA-Z0-9_.-]+/g, '_');
        return action({
          id: actionId,
          name: String(capability.name ?? 'Run skill'),
          description: String(capability.description ?? skill.description ?? 'Run installed skill capability.'),
          inputSchema: asRecord(capability.params ?? skill.inputs ?? genericObjectSchema),
          outputSchema: asRecord(capability.returns ?? skill.outputs ?? genericObjectSchema),
          executeEndpoint: `/api/capabilities/${encodeURIComponent(capabilityId)}/actions/${encodeURIComponent(actionId)}/execute`,
          confirmationRequired: false,
          riskLevel: 'low',
          permissions: stringArray(skill.permissions_required),
          timeoutMs: 60_000,
          retryable: true,
        });
      }) : [action({
        id: 'run',
        name: 'Run skill',
        description: 'Run installed skill capability.',
        inputSchema: genericObjectSchema,
        outputSchema: genericObjectSchema,
        executeEndpoint: `/api/capabilities/${encodeURIComponent(capabilityId)}/actions/run/execute`,
        confirmationRequired: false,
        riskLevel: 'low',
        permissions: stringArray(skill.permissions_required),
        timeoutMs: 60_000,
        retryable: true,
      })];
      return [node({
        id: capabilityId,
        sourceType: 'skill',
        sourceId: String(skill.id),
        name: String(skill.name ?? 'Skill'),
        description: String(skill.description ?? 'Installed skill'),
        status: row.status === 'disabled' ? 'disabled' : missingSecrets.length > 0 ? 'needs_config' : 'available',
        statusReason: row.status === 'disabled'
          ? 'Skill is disabled.'
          : missingSecrets.length > 0
            ? `Missing required secrets: ${missingSecrets.map(item => item.secretId).join(', ')}`
            : null,
        actions,
        requiredPermissions: stringArray(skill.permissions_required),
        requiredSecrets,
        inputSchema: genericObjectSchema,
        outputSchema: genericObjectSchema,
        metadata: { slug: skill.slug ?? null, category: skill.category ?? null, installationId: row.id },
      })];
    });
  } catch (error) {
    if (!localFallbackAllowed()) throw error;
    const state = await readLocalRuntimeState();
    return (state.skills.installations[params.ownerAgentId] ?? []).flatMap(installation => {
      const skill = state.skills.catalog.find(item => item.id === installation.skill_id);
      if (!skill || installation.status === 'removed') return [];
      const capabilityId = stableId('skill', skill.slug);
      const requiredSecrets = secretRefs(skill.required_secrets ?? [], params.availableSecrets);
      const missingSecrets = requiredSecrets.filter(item => item.availabilityStatus === 'missing');
      return [node({
        id: capabilityId,
        sourceType: 'skill',
        sourceId: skill.id,
        name: skill.name,
        description: skill.description,
        status: installation.status === 'disabled' ? 'disabled' : missingSecrets.length > 0 ? 'needs_config' : 'available',
        statusReason: missingSecrets.length > 0 ? `Missing required secrets: ${missingSecrets.map(item => item.secretId).join(', ')}` : null,
        actions: (skill.capabilities.length ? skill.capabilities : [{ name: 'run', description: 'Run installed skill capability.' }]).map(capability => action({
          id: String(capability.name ?? 'run'),
          name: String(capability.name ?? 'Run skill'),
          description: String(capability.description ?? skill.description),
          inputSchema: genericObjectSchema,
          outputSchema: genericObjectSchema,
          executeEndpoint: `/api/capabilities/${encodeURIComponent(capabilityId)}/actions/${encodeURIComponent(String(capability.name ?? 'run'))}/execute`,
          confirmationRequired: false,
          riskLevel: 'low',
          permissions: skill.permissions_required ?? [],
          timeoutMs: 60_000,
          retryable: true,
        })),
        requiredPermissions: skill.permissions_required ?? [],
        requiredSecrets,
        inputSchema: genericObjectSchema,
        outputSchema: genericObjectSchema,
        metadata: { slug: skill.slug, category: skill.category, installationId: installation.id },
      })];
    });
  }
}

async function workflowNodes(params: {
  ownerAgentId: string;
  workspaceId?: string | null;
  projectId?: string | null;
}): Promise<CapabilityNode[]> {
  try {
    let query = getSupabaseAdmin()
      .from('agent_workflows')
      .select('id,name,summary,status,workspace_id,project_id,schedule,updated_at')
      .eq('agent_id', params.ownerAgentId)
      .order('updated_at', { ascending: false });
    if (params.workspaceId) query = query.eq('workspace_id', params.workspaceId);
    if (params.projectId) query = query.eq('project_id', params.projectId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return ((data ?? []) as Record<string, unknown>[]).map(row => {
      const capabilityId = stableId('workflow', String(row.id));
      return node({
        id: capabilityId,
        sourceType: 'workflow',
        sourceId: String(row.id),
        name: String(row.name ?? 'Workflow'),
        description: typeof row.summary === 'string' ? row.summary : 'Saved workflow',
        status: row.status === 'disabled' || row.status === 'archived' ? 'disabled' : 'available',
        statusReason: row.status === 'disabled' || row.status === 'archived' ? `Workflow status is ${String(row.status)}.` : null,
        actions: [action({
          id: 'run',
          name: 'Run workflow',
          description: 'Run this saved workflow through the execution engine.',
          inputSchema: genericObjectSchema,
          outputSchema: genericObjectSchema,
          executeEndpoint: `/api/capabilities/${encodeURIComponent(capabilityId)}/actions/run/execute`,
          confirmationRequired: true,
          riskLevel: 'medium',
          permissions: ['run_workflow'],
          timeoutMs: 120_000,
          retryable: true,
        })],
        requiredPermissions: ['run_workflow'],
        requiredSecrets: [],
        inputSchema: genericObjectSchema,
        outputSchema: genericObjectSchema,
        metadata: {
          workspaceId: row.workspace_id ?? null,
          projectId: row.project_id ?? null,
          schedule: row.schedule ?? null,
        },
      });
    });
  } catch {
    return [];
  }
}

function libraryNode(item: LibraryItem): CapabilityNode {
  const capabilityId = stableId('library', item.id);
  return node({
    id: capabilityId,
    sourceType: 'library',
    sourceId: item.id,
    name: item.name,
    description: item.description ?? item.kind,
    status: 'available',
    statusReason: null,
    actions: [action({
      id: 'inspect',
      name: 'Inspect library item',
      description: 'Read metadata for this Library item.',
      inputSchema: emptyObjectSchema,
      outputSchema: genericObjectSchema,
      executeEndpoint: `/api/capabilities/${encodeURIComponent(capabilityId)}/actions/inspect/execute`,
      confirmationRequired: false,
      riskLevel: 'low',
      permissions: ['library:read'],
      timeoutMs: 10_000,
      retryable: false,
    })],
    requiredPermissions: ['library:read'],
    requiredSecrets: [],
    inputSchema: emptyObjectSchema,
    outputSchema: genericObjectSchema,
    metadata: { kind: item.kind, href: item.href, workspaceId: item.workspaceId, projectId: item.projectId, ...item.metadata },
  });
}

function systemCapability(params: {
  sourceId: string;
  name: string;
  description: string;
  actionId?: string;
  actionName?: string;
  permissions: string[];
  status?: CapabilityStatus;
  statusReason?: string | null;
  metadata?: Record<string, unknown>;
}): CapabilityNode {
  const capabilityId = stableId('system', params.sourceId);
  return node({
    id: capabilityId,
    sourceType: 'system',
    sourceId: params.sourceId,
    name: params.name,
    description: params.description,
    provider: 'AgentOS',
    version: RUNTIME_CONTRACT_VERSION,
    status: params.status ?? 'available',
    statusReason: params.statusReason ?? null,
    actions: params.status === 'needs_config' ? [] : [action({
      id: params.actionId ?? 'describe',
      name: params.actionName ?? `Describe ${params.name}`,
      description: params.description,
      inputSchema: emptyObjectSchema,
      outputSchema: genericObjectSchema,
      executeEndpoint: `/api/capabilities/${encodeURIComponent(capabilityId)}/actions/${encodeURIComponent(params.actionId ?? 'describe')}/execute`,
      confirmationRequired: false,
      riskLevel: 'low',
      permissions: params.permissions,
      timeoutMs: 10_000,
      retryable: false,
    })],
    requiredPermissions: params.permissions,
    requiredSecrets: [],
    dependencies: [],
    costProfile: { unit: 'platform', estimatedCost: 0 },
    computeRequirement: { tier: 'low', worker: 'runtime' },
    supportedModels: [],
    supportedContextTypes: ['workspace'],
    executionPriority: 90,
    confidenceScore: params.status === 'needs_config' ? 0.4 : 1,
    fallbackCapabilities: [],
    inputSchema: emptyObjectSchema,
    outputSchema: genericObjectSchema,
    metadata: params.metadata ?? {},
  });
}

export async function buildCapabilityGraph(params: {
  ownerAgentId: string;
  workspaceId?: string | null;
  projectId?: string | null;
}): Promise<CapabilityGraph> {
  const vault = params.workspaceId
    ? await listVaultSecrets({ ownerAgentId: params.ownerAgentId, workspaceId: params.workspaceId }).catch(() => ({ secrets: [] }))
    : { secrets: [] };
  const availableSecrets = new Set((vault.secrets ?? []).filter(secret => secret.status === 'active').map(secret => secret.name.toUpperCase()));
  const [persisted, apps, skills, workflows, subagents, mcpTools, projects, library] = await Promise.all([
    listPersistedCapabilities(params).catch(() => []),
    listInstalledAgentApps(params.ownerAgentId).catch(() => []),
    installedSkillNodes({ ownerAgentId: params.ownerAgentId, workspaceId: params.workspaceId, availableSecrets }).catch(() => []),
    workflowNodes(params).catch(() => []),
    listAccessibleSubagents({
      viewerAgentId: params.ownerAgentId,
      workspaceId: params.workspaceId,
      projectId: params.projectId,
    }).catch(() => []),
    listUniversalMcpTools().catch(() => []),
    params.workspaceId
      ? listProjects({ ownerAgentId: params.ownerAgentId, workspaceId: params.workspaceId, status: 'all' }).catch(() => [])
      : Promise.resolve([]),
    listLibrary({
      ownerAgentId: params.ownerAgentId,
      workspaceId: params.workspaceId,
      projectId: params.projectId,
      limit: 120,
    }).catch(() => ({ items: [] as LibraryItem[] })),
  ]);

  const appNodes = apps.map(entry => {
    const app = entry.app;
    const capabilityId = stableId('app', app.slug);
    const requiredSecrets = secretRefs(app.requiredSecrets.length ? app.requiredSecrets : app.manifest.requiredSecrets, availableSecrets);
    const missingSecrets = requiredSecrets.filter(item => item.availabilityStatus === 'missing');
    const commandActions = app.manifest.commands.map(command => action({
      id: String(command.name || 'run').replace(/[^a-zA-Z0-9_.-]+/g, '_'),
      name: String(command.name || 'Run app command'),
      description: String(command.description || `Run ${app.name}.`),
      inputSchema: genericObjectSchema,
      outputSchema: genericObjectSchema,
      executeEndpoint: app.kernelCommandTopic
        ? `/api/capabilities/${encodeURIComponent(capabilityId)}/actions/${encodeURIComponent(String(command.name || 'run'))}/execute`
        : '',
      confirmationRequired: true,
      riskLevel: app.requiredSecrets.length > 0 ? 'high' : 'medium',
      permissions: app.permissionsRequired.length ? app.permissionsRequired : app.manifest.permissions,
      timeoutMs: 120_000,
      retryable: true,
    }));
    return node({
      id: capabilityId,
      sourceType: 'app',
      sourceId: app.id,
      name: app.name,
      description: app.description,
      status: entry.installation.status === 'disabled' || app.disabled
        ? 'disabled'
        : app.healthStatus === 'offline' || app.endpointStatus === 'offline'
          ? 'error'
          : missingSecrets.length > 0
            ? 'needs_config'
            : 'available',
      statusReason: entry.installation.status === 'disabled' || app.disabled
        ? 'App is disabled.'
        : app.healthStatus === 'offline' || app.endpointStatus === 'offline'
          ? app.lastError ?? 'App health check is offline.'
          : missingSecrets.length > 0
            ? `Missing required secrets: ${missingSecrets.map(item => item.secretId).join(', ')}`
            : null,
      actions: [
        action({
          id: 'open',
          name: 'Open app',
          description: 'Open the installed app target.',
          inputSchema: { type: 'object', properties: { target: { type: 'string', enum: ['web', 'android', 'ios'] } }, additionalProperties: false },
          outputSchema: genericObjectSchema,
          executeEndpoint: `/api/capabilities/${encodeURIComponent(capabilityId)}/actions/open/execute`,
          confirmationRequired: false,
          riskLevel: 'low',
          permissions: ['install_app'],
          timeoutMs: 30_000,
          retryable: false,
        }),
        ...commandActions,
      ],
      requiredPermissions: app.permissionsRequired.length ? app.permissionsRequired : app.manifest.permissions,
      requiredSecrets,
      inputSchema: genericObjectSchema,
      outputSchema: genericObjectSchema,
      metadata: {
        slug: app.slug,
        installationId: entry.installation.id,
        healthStatus: app.healthStatus,
        endpointStatus: app.endpointStatus,
        appUrl: app.appUrl,
        kernelCommandTopic: app.kernelCommandTopic,
      },
    });
  });

  const subagentNodes = subagents.map(item => {
    const capabilityId = stableId('subagent', item.id);
    return node({
      id: capabilityId,
      sourceType: 'subagent',
      sourceId: item.id,
      name: item.name,
      description: item.description ?? 'Private subagent',
      status: item.status === 'active' || item.status === 'running' ? 'available' : 'disabled',
      statusReason: item.status === 'active' || item.status === 'running' ? null : `Subagent status is ${item.status}.`,
      actions: [action({
        id: 'delegate',
        name: 'Delegate task',
        description: 'Delegate a command to this private subagent.',
        inputSchema: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'], additionalProperties: true },
        outputSchema: genericObjectSchema,
        executeEndpoint: `/api/capabilities/${encodeURIComponent(capabilityId)}/actions/delegate/execute`,
        confirmationRequired: false,
        riskLevel: 'low',
        permissions: ['agent:invoke'],
        timeoutMs: 120_000,
        retryable: true,
      })],
      requiredPermissions: ['agent:invoke'],
      requiredSecrets: [],
      inputSchema: genericObjectSchema,
      outputSchema: genericObjectSchema,
      metadata: { workspaceId: item.workspaceId, projectId: item.projectId, exposedCapabilities: item.exposedCapabilities },
    });
  });

  const externalMcpNodes = mcpTools
    .filter(tool => tool.source === 'external')
    .map(tool => {
      const capabilityId = stableId('mcp', tool.name);
      return node({
        id: capabilityId,
        sourceType: 'mcp',
        sourceId: tool.name,
        name: tool.title,
        description: tool.description,
        status: 'available',
        statusReason: null,
        actions: [action({
          id: 'execute',
          name: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema,
          executeEndpoint: `/api/capabilities/${encodeURIComponent(capabilityId)}/actions/execute/execute`,
          confirmationRequired: tool.requires_consensus,
          riskLevel: tool.requires_consensus ? 'high' : 'low',
          permissions: ['mcp:execute'],
          timeoutMs: 60_000,
          retryable: true,
        })],
        requiredPermissions: ['mcp:execute'],
        requiredSecrets: [],
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        metadata: { server: tool.server, toolName: tool.aliases[0] ?? tool.name, source: tool.source },
      });
    });

  const systemNodes = [
    systemCapability({
      sourceId: 'super-agentos-runtime',
      name: 'Super AgentOS Runtime',
      description: 'Single orchestration kernel for intent, planning, approvals, task dispatch, recovery, and result synthesis.',
      permissions: ['runtime:execute'],
      metadata: { layer: 'Super AgentOS Runtime', owner: 'runtime' },
    }),
    systemCapability({
      sourceId: 'workspace-context',
      name: 'Workspace Context',
      description: 'Read current workspace context, capability summary, memory metadata, projects, and Library assets.',
      permissions: ['workspace:read'],
      metadata: { layer: 'Workspace Intelligence', owner: 'workspace-context-engine' },
    }),
    systemCapability({
      sourceId: 'runtime-registry',
      name: 'Runtime Registry',
      description: 'Canonical inventory of registered workspace assets and published capabilities.',
      permissions: ['registry:read'],
      metadata: { layer: 'Capability Layer', owner: 'runtime-registry' },
    }),
    systemCapability({
      sourceId: 'capability-graph',
      name: 'Capability Graph',
      description: 'Deterministic capability resolution, ranking, dependencies, and fallback relationships.',
      permissions: ['capability:read'],
      metadata: { layer: 'Capability Layer', owner: 'capability-graph' },
    }),
    systemCapability({
      sourceId: 'task-engine',
      name: 'Task Engine',
      description: 'Durable task lifecycle, execution timeline, retries, cancellation, and recovery.',
      permissions: ['tasks:read'],
      metadata: { layer: 'Execution Layer', owner: 'task-engine' },
    }),
    systemCapability({
      sourceId: 'scheduler',
      name: 'Scheduler',
      description: 'Central queue, recurring execution, time-based scheduling, and dependency scheduling contract.',
      permissions: ['scheduler:read'],
      metadata: { layer: 'Execution Layer', owner: 'scheduler' },
    }),
    systemCapability({
      sourceId: 'approval-system',
      name: 'Approval System',
      description: 'Approval policy, persistence, history, expiration, and authorization gating.',
      permissions: ['approvals:read'],
      metadata: { layer: 'Execution Layer', owner: 'approval-system' },
    }),
    systemCapability({
      sourceId: 'memory-resolver',
      name: 'Memory Resolver',
      description: 'Permission-aware memory search and execution-history context for Super AgentOS planning.',
      permissions: ['memory:read'],
      metadata: { layer: 'Workspace Intelligence', owner: 'memory-service' },
    }),
    systemCapability({
      sourceId: 'vault-metadata',
      name: 'Vault Metadata',
      description: 'Secret metadata discovery for runtime planning without exposing secret values.',
      permissions: ['vault:metadata:read'],
      metadata: { layer: 'Workspace Intelligence', owner: 'vault-service' },
    }),
    systemCapability({
      sourceId: 'unified-search',
      name: 'Unified Search',
      description: 'Search workspace apps, skills, tasks, projects, memory, files, conversations, subagents, SDK assets, and MCP servers.',
      permissions: ['search:read'],
      metadata: { layer: 'Platform Services', owner: 'search-service' },
    }),
    node({
      id: stableId('system', 'computer-use'),
      sourceType: 'system',
      sourceId: 'computer-use',
      name: 'Computer Use',
      description: 'Browser automation capability contract for future web interactions.',
      provider: 'AgentOS',
      version: RUNTIME_CONTRACT_VERSION,
      status: 'needs_config',
      statusReason: 'Browser automation backend is not connected to AgentOS runtime.',
      actions: [],
      requiredPermissions: ['computer:use'],
      requiredSecrets: [],
      dependencies: ['system:super-agentos-runtime'],
      costProfile: {},
      computeRequirement: { tier: 'medium', worker: 'browser' },
      supportedModels: [],
      supportedContextTypes: ['workspace', 'browser'],
      executionPriority: 20,
      confidenceScore: 0.35,
      fallbackCapabilities: [],
      inputSchema: genericObjectSchema,
      outputSchema: genericObjectSchema,
      metadata: { supportedStates: ['available', 'needs_setup', 'unavailable'], currentState: 'unavailable' },
    }),
  ];

  const projectNodes = projects.map(project => {
    const capabilityId = stableId('project', project.id);
    return node({
      id: capabilityId,
      sourceType: 'project',
      sourceId: project.id,
      name: project.name,
      description: project.description ?? 'Workspace project',
      status: project.status === 'archived' ? 'disabled' : 'available',
      statusReason: project.status === 'archived' ? 'Project is archived.' : null,
      actions: [action({
        id: 'inspect',
        name: 'Inspect project',
        description: 'Read project metadata and scoped assets.',
        inputSchema: emptyObjectSchema,
        outputSchema: genericObjectSchema,
        executeEndpoint: `/api/projects/${encodeURIComponent(project.id)}`,
        confirmationRequired: false,
        riskLevel: 'low',
        permissions: ['project:read'],
        timeoutMs: 10_000,
        retryable: false,
      })],
      requiredPermissions: ['project:read'],
      requiredSecrets: [],
      inputSchema: emptyObjectSchema,
      outputSchema: genericObjectSchema,
      metadata: { workspaceId: project.workspaceId, status: project.status },
    });
  });

  const libraryNodes = library.items.slice(0, 80).map(libraryNode);
  return summarizeGraph(dedupe([...systemNodes, ...appNodes, ...skills, ...workflows, ...subagentNodes, ...externalMcpNodes, ...projectNodes, ...libraryNodes, ...persisted]));
}

export async function getCapabilityNode(params: {
  ownerAgentId: string;
  capabilityId: string;
  workspaceId?: string | null;
  projectId?: string | null;
}): Promise<CapabilityNode> {
  const graph = await buildCapabilityGraph(params);
  const node = [...graph.availableCapabilities, ...graph.unavailableCapabilities].find(item => item.id === params.capabilityId);
  if (!node) throw new NotFoundError('Capability not found');
  return node;
}

export async function registerCapabilityNode(params: {
  ownerAgentId: string;
  workspaceId?: string | null;
  node: CapabilityNodeInput;
}): Promise<CapabilityNode> {
  const capability = node(params.node);
  const row = {
    id: capability.id || crypto.randomUUID(),
    owner_agent_id: params.ownerAgentId,
    workspace_id: params.workspaceId ?? null,
    source_type: capability.sourceType,
    source_id: capability.sourceId,
    name: capability.name,
    description: capability.description,
    provider: capability.provider,
    version: capability.version,
    status: capability.status,
    health_status: capability.health,
    status_reason: capability.statusReason,
    actions: redactSecretsDeep(capability.actions),
    required_permissions: capability.requiredPermissions,
    required_secrets: redactSecretsDeep(capability.requiredSecrets),
    dependencies: capability.dependencies,
    cost_profile: redactSecretsDeep(capability.costProfile),
    compute_requirement: redactSecretsDeep(capability.computeRequirement),
    supported_models: capability.supportedModels,
    supported_context_types: capability.supportedContextTypes,
    execution_priority: capability.executionPriority,
    confidence_score: capability.confidenceScore,
    fallback_capabilities: capability.fallbackCapabilities,
    input_schema: capability.inputSchema,
    output_schema: capability.outputSchema,
    metadata: redactSecretsDeep(capability.metadata),
    created_at: capability.createdAt,
    updated_at: new Date().toISOString(),
  };
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('capability_registry')
      .upsert(row, { onConflict: 'owner_agent_id,source_type,source_id' })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return mapCapability(data as Record<string, unknown>);
  } catch (error) {
    if (!localFallbackAllowed()) throw error;
    return updateLocalRuntimeState(state => {
      const index = state.capabilityRegistry.findIndex(item =>
        String(item.owner_agent_id ?? item.ownerAgentId) === params.ownerAgentId
        && String(item.source_type ?? item.sourceType) === capability.sourceType
        && String(item.source_id ?? item.sourceId) === capability.sourceId
      );
      if (index >= 0) state.capabilityRegistry[index] = row;
      else state.capabilityRegistry.unshift(row);
      return mapCapability(row);
    });
  }
}

function summarizeInput(input: Record<string, unknown>): string {
  const keys = Object.keys(redactSecretsDeep(input) as Record<string, unknown>).slice(0, 8);
  return keys.length ? `Input keys: ${keys.join(', ')}` : 'No input';
}

async function executeCapabilityRuntime(params: {
  ctx: AgentContext;
  capability: CapabilityNode;
  action: CapabilityAction;
  input: Record<string, unknown>;
  task: AgentTaskRecord;
}): Promise<unknown> {
  if (params.capability.sourceType === 'app') {
    if (params.action.id === 'open') {
      return executeAgentOSAction(params.ctx, {
        action: 'open_app',
        source: 'api',
        workspaceId: params.task.workspaceId,
        projectId: params.task.projectId,
        sessionId: params.task.sessionId,
        payload: {
          slug: params.capability.metadata.slug,
          target: (params.input.target === 'android' || params.input.target === 'ios' ? params.input.target : 'web') as AgentAppOpenTarget,
        },
      });
    }
    if (!params.capability.metadata.kernelCommandTopic) {
      throw new ValidationError('Capability unavailable: app command endpoint is not connected.');
    }
    throw new ValidationError('Capability unavailable: app command dispatch is not connected to the AgentOS runtime yet.');
  }

  if (params.capability.sourceType === 'skill') {
    const capabilityName = params.action.id;
    const execution = await runInstalledSkill({
      agentId: params.ctx.agentId,
      studioSessionId: params.task.sessionId,
      skillSlug: String(params.capability.metadata.slug ?? params.capability.sourceId),
      capability: capabilityName,
      input: params.input,
    });
    return {
      result: execution.result,
      execution_time_ms: execution.executionTimeMs,
      stderr: execution.stderr,
    };
  }

  if (params.capability.sourceType === 'workflow') {
    return executeAgentOSAction(params.ctx, {
      action: 'run_workflow',
      source: 'api',
      workspaceId: params.task.workspaceId,
      projectId: params.task.projectId,
      sessionId: params.task.sessionId,
      payload: { workflowId: params.capability.sourceId },
    });
  }

  if (params.capability.sourceType === 'subagent') {
    const prompt = typeof params.input.prompt === 'string' ? params.input.prompt : '';
    if (!prompt.trim()) throw new ValidationError('prompt is required');
    return executeStudioCommand({
      agentContext: params.ctx,
      command: prompt,
      advancedMode: params.input.advancedMode === true,
    });
  }

  if (params.capability.sourceType === 'mcp') {
    const toolName = typeof params.capability.metadata.toolName === 'string' ? params.capability.metadata.toolName : params.capability.sourceId;
    const server = typeof params.capability.metadata.server === 'string' ? params.capability.metadata.server : undefined;
    return executeUniversalToolCall({
      agentContext: params.ctx,
      name: params.capability.sourceId,
      server,
      arguments: Object.keys(params.input).length ? params.input : { toolName },
    });
  }

  if (params.capability.sourceType === 'library' || params.capability.sourceType === 'project' || params.capability.sourceType === 'system') {
    if (params.action.id !== 'inspect' && params.action.id !== 'describe') {
      throw new ValidationError('This capability only supports read inspection.');
    }
    return {
      capability: params.capability,
      status: params.capability.status,
      metadata: params.capability.metadata,
    };
  }

  throw new ValidationError('Capability source type is not executable.');
}

export async function executeCapabilityAction(params: {
  ctx: AgentContext;
  capabilityId: string;
  actionId: string;
  input?: Record<string, unknown>;
  workspaceId?: string | null;
  projectId?: string | null;
  sessionId?: string | null;
  taskId?: string | null;
  approvedConfirmationId?: string | null;
}): Promise<{
  status: 'completed' | 'awaiting_confirmation' | 'needs_configuration' | 'failed';
  task: AgentTaskRecord;
  confirmation?: unknown;
  result?: unknown;
}> {
  const capability = await getCapabilityNode({
    ownerAgentId: params.ctx.agentId,
    capabilityId: params.capabilityId,
    workspaceId: params.workspaceId,
    projectId: params.projectId,
  });
  const action = capability.actions.find(item => item.id === params.actionId);
  if (!action) throw new NotFoundError('Capability action not found');
  const input = params.input ?? {};

  const task = params.taskId
    ? getAgentTaskBundle({ userId: params.ctx.agentId, taskId: params.taskId }).then(bundle => bundle.task)
    : createAgentTask({
      userId: params.ctx.agentId,
      workspaceId: params.workspaceId,
      projectId: params.projectId,
      sessionId: params.sessionId,
      title: `${action.name}: ${capability.name}`,
      originalPrompt: typeof input.prompt === 'string' ? input.prompt : `${action.name}: ${capability.name}`,
      status: capability.status === 'available' ? 'planning' : 'needs_configuration',
      plan: [{
        step: 'execute_capability_action',
        status: capability.status === 'available' ? 'planning' : 'needs_configuration',
        capabilityId: capability.id,
        actionId: action.id,
        actionName: action.name,
        contract: capability.contract,
      }],
      capabilityIds: [capability.id],
      plannerVersion: PLANNER_VERSION,
      requiredPermissions: [...new Set([...capability.requiredPermissions, ...action.permissions])],
      progress: capability.status === 'available' ? 10 : 0,
      metadata: { capabilitySourceType: capability.sourceType, capabilitySourceId: capability.sourceId },
      executionMetadata: {
        runtime: 'super-agentos',
        runtimeVersion: RUNTIME_CONTRACT_VERSION,
        capabilityGraphVersion: capability.version,
        capabilityContract: capability.contract,
      },
    });
  const resolvedTask = await task;

  if (capability.status !== 'available') {
    await appendAgentTaskStep({
      userId: params.ctx.agentId,
      taskId: resolvedTask.id,
      capabilityId: capability.id,
      actionId: action.id,
      status: 'needs_configuration',
      inputSummary: summarizeInput(input),
      errorMessage: capability.statusReason ?? 'Capability is not available.',
    });
    const updated = await updateAgentTask({
      userId: params.ctx.agentId,
      taskId: resolvedTask.id,
      patch: {
        status: 'needs_configuration',
        errorMessage: capability.statusReason ?? 'Capability is not available.',
        progress: 0,
      },
    });
    await logSuperAgentAudit({
      userId: params.ctx.agentId,
      workspaceId: resolvedTask.workspaceId,
      sessionId: resolvedTask.sessionId,
      taskId: resolvedTask.id,
      action: 'capability_needs_configuration',
      capabilityId: capability.id,
      riskLevel: action.riskLevel,
      permissionUsed: action.permissions.join(', ') || null,
      success: false,
      errorMessage: capability.statusReason ?? 'Capability is not available.',
      metadata: { actionId: action.id, sourceType: capability.sourceType, sourceId: capability.sourceId },
    });
    return { status: 'needs_configuration', task: updated };
  }

  const policy = evaluateConfirmationPolicy({
    actionName: action.name,
    riskLevel: action.riskLevel,
    confirmationRequired: action.confirmationRequired,
    permissions: action.permissions,
    requiredSecrets: capability.requiredSecrets.map(item => String(item.secretId ?? '')).filter(Boolean),
  });
  if (policy.confirmationRequired && !params.approvedConfirmationId) {
    const confirmation = await createConfirmation({
      userId: params.ctx.agentId,
      taskId: resolvedTask.id,
      capabilityId: capability.id,
      actionId: action.id,
      actionName: action.name,
      riskLevel: action.riskLevel,
      dataSummary: summarizeInput(input),
      secretScopes: capability.requiredSecrets.map(item => String(item.scope ?? item.secretId ?? '')).filter(Boolean),
      expectedResult: action.description,
      payload: { capabilityId: capability.id, actionId: action.id, input },
      requiredApprovals: policy.requiredApprovals,
    });
    const updated = await updateAgentTask({
      userId: params.ctx.agentId,
      taskId: resolvedTask.id,
      patch: {
        status: 'waiting_for_approval',
        confirmationStatus: 'pending',
        progress: 20,
      },
    });
    await logSuperAgentAudit({
      userId: params.ctx.agentId,
      workspaceId: resolvedTask.workspaceId,
      sessionId: resolvedTask.sessionId,
      taskId: resolvedTask.id,
      action: 'capability_awaiting_confirmation',
      capabilityId: capability.id,
      riskLevel: action.riskLevel,
      permissionUsed: action.permissions.join(', ') || null,
      success: true,
      metadata: {
        actionId: action.id,
        confirmationId: typeof confirmation === 'object' && confirmation && 'id' in confirmation ? String(confirmation.id) : null,
        requiredApprovals: policy.requiredApprovals,
      },
    });
    return { status: 'awaiting_confirmation', task: updated, confirmation };
  }

  if (policy.confirmationRequired && params.approvedConfirmationId) {
    const confirmation = await getConfirmation({
      userId: params.ctx.agentId,
      confirmationId: params.approvedConfirmationId,
    });
    if (confirmation.status !== 'approved') {
      throw new ValidationError('Capability execution requires an approved confirmation.');
    }
    if (
      confirmation.taskId !== resolvedTask.id
      || confirmation.capabilityId !== capability.id
      || confirmation.actionId !== action.id
    ) {
      throw new ValidationError('Approved confirmation does not match this capability action.');
    }
  }

  await appendAgentTaskStep({
    userId: params.ctx.agentId,
    taskId: resolvedTask.id,
    capabilityId: capability.id,
    actionId: action.id,
    status: 'running',
    inputSummary: summarizeInput(input),
  });
  await updateAgentTask({
    userId: params.ctx.agentId,
    taskId: resolvedTask.id,
    patch: { status: 'running', progress: 40 },
  });

  try {
    const tracked = await runTrackedExecution({
      agentId: params.ctx.agentId,
      workspaceId: params.workspaceId,
      projectId: params.projectId,
      sessionId: params.sessionId,
      sourceType: capability.sourceType === 'project' || capability.sourceType === 'library' ? 'system' : capability.sourceType,
      sourceId: capability.sourceId,
      title: `${action.name}: ${capability.name}`,
      input,
      metadata: { taskId: resolvedTask.id, capabilityId: capability.id, actionId: action.id },
      run: () => executeCapabilityRuntime({ ctx: params.ctx, capability, action, input, task: resolvedTask }),
    });
    const result = sanitizeOutput(tracked.result);
    await appendAgentTaskStep({
      userId: params.ctx.agentId,
      taskId: resolvedTask.id,
      capabilityId: capability.id,
      actionId: action.id,
      status: 'completed',
      outputSummary: typeof result === 'string' ? result.slice(0, 500) : JSON.stringify(result).slice(0, 500),
      metadata: { executionId: tracked.execution.id },
    });
    const updated = await updateAgentTask({
      userId: params.ctx.agentId,
      taskId: resolvedTask.id,
      patch: {
        status: 'completed',
        confirmationStatus: params.approvedConfirmationId ? 'approved' : resolvedTask.confirmationStatus,
        progress: 100,
        resultSummary: `${action.name} completed.`,
        metadata: { ...resolvedTask.metadata, executionId: tracked.execution.id },
      },
    });
    await logSuperAgentAudit({
      userId: params.ctx.agentId,
      workspaceId: resolvedTask.workspaceId,
      sessionId: resolvedTask.sessionId,
      taskId: resolvedTask.id,
      action: 'capability_action_execute',
      capabilityId: capability.id,
      riskLevel: action.riskLevel,
      permissionUsed: action.permissions.join(', ') || null,
      success: true,
      metadata: { actionId: action.id, executionId: tracked.execution.id },
    });
    return { status: 'completed', task: updated, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Capability execution failed';
    await appendAgentTaskStep({
      userId: params.ctx.agentId,
      taskId: resolvedTask.id,
      capabilityId: capability.id,
      actionId: action.id,
      status: 'failed',
      errorMessage: message,
    });
    const updated = await updateAgentTask({
      userId: params.ctx.agentId,
      taskId: resolvedTask.id,
      patch: { status: 'failed', errorMessage: message, progress: 100 },
    });
    await logSuperAgentAudit({
      userId: params.ctx.agentId,
      workspaceId: resolvedTask.workspaceId,
      sessionId: resolvedTask.sessionId,
      taskId: resolvedTask.id,
      action: 'capability_action_execute',
      capabilityId: capability.id,
      riskLevel: action.riskLevel,
      permissionUsed: action.permissions.join(', ') || null,
      success: false,
      errorMessage: message,
      metadata: { actionId: action.id },
    });
    return { status: 'failed', task: updated };
  }
}
