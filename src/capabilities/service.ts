import crypto from 'crypto';
import { executeAgentOSAction } from '../actions/service.js';
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
  status: CapabilityStatus;
  statusReason: string | null;
  actions: CapabilityAction[];
  requiredPermissions: string[];
  requiredSecrets: Array<Record<string, unknown>>;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CapabilityGraph = {
  availableCapabilities: CapabilityNode[];
  unavailableCapabilities: CapabilityNode[];
  needsConfiguration: CapabilityNode[];
  summary: {
    total: number;
    available: number;
    needsConfiguration: number;
    disabled: number;
    error: number;
    bySourceType: Record<CapabilitySourceType, number>;
  };
};

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

function node(params: Omit<CapabilityNode, 'createdAt' | 'updatedAt'> & { createdAt?: string; updatedAt?: string }): CapabilityNode {
  const now = new Date().toISOString();
  const actions = params.actions.map(item => ({ ...item, capabilityId: params.id }));
  return {
    ...params,
    actions,
    createdAt: params.createdAt ?? now,
    updatedAt: params.updatedAt ?? now,
  };
}

function normalizeStatus(value: unknown): CapabilityStatus {
  return value === 'available' || value === 'needs_config' || value === 'disabled' || value === 'error' ? value : 'available';
}

function normalizeRisk(value: unknown): RiskLevel {
  return value === 'medium' || value === 'high' || value === 'critical' ? value : 'low';
}

function mapCapability(row: Record<string, unknown>): CapabilityNode {
  const id = String(row.id);
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
    status: normalizeStatus(row.status),
    statusReason: typeof (row.status_reason ?? row.statusReason) === 'string' ? String(row.status_reason ?? row.statusReason) : null,
    actions: rawActions,
    requiredPermissions: stringArray(row.required_permissions ?? row.requiredPermissions),
    requiredSecrets: recordArray(row.required_secrets ?? row.requiredSecrets),
    inputSchema: asRecord(row.input_schema ?? row.inputSchema),
    outputSchema: asRecord(row.output_schema ?? row.outputSchema),
    metadata: asRecord(row.metadata),
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
  return {
    availableCapabilities,
    unavailableCapabilities,
    needsConfiguration,
    summary: {
      total: nodes.length,
      available: availableCapabilities.length,
      needsConfiguration: needsConfiguration.length,
      disabled: nodes.filter(item => item.status === 'disabled').length,
      error: nodes.filter(item => item.status === 'error').length,
      bySourceType,
    },
  };
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
    const { data, error } = await getSupabaseAdmin()
      .from('skill_installations')
      .select(`
        id,
        workspace_id,
        status,
        permissions_approved,
        skill:skills(id,name,slug,category,description,capabilities,permissions_required,required_secrets,inputs,outputs)
      `)
      .eq('agent_id', params.ownerAgentId)
      .neq('status', 'removed')
      .order('installed_at', { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<Record<string, unknown>>).flatMap(row => {
      const skill = asRecord(row.skill);
      if (!skill.id) return [];
      const capabilityId = stableId('skill', String(skill.slug ?? skill.id));
      const caps = recordArray(skill.capabilities);
      const requiredSecrets = secretRefs(stringArray(skill.required_secrets), params.availableSecrets);
      const missingSecrets = requiredSecrets.filter(item => item.availabilityStatus === 'missing');
      const actions = caps.length > 0 ? caps.map(capability => action({
        id: String(capability.name ?? 'run').replace(/[^a-zA-Z0-9_.-]+/g, '_'),
        name: String(capability.name ?? 'Run skill'),
        description: String(capability.description ?? skill.description ?? 'Run installed skill capability.'),
        inputSchema: asRecord(capability.params ?? skill.inputs ?? genericObjectSchema),
        outputSchema: asRecord(capability.returns ?? skill.outputs ?? genericObjectSchema),
        executeEndpoint: `/api/capabilities/${encodeURIComponent(capabilityId)}/actions/${encodeURIComponent(String(capability.name ?? 'run'))}/execute`,
        confirmationRequired: false,
        riskLevel: 'low',
        permissions: stringArray(skill.permissions_required),
        timeoutMs: 60_000,
        retryable: true,
      })) : [action({
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
    node({
      id: stableId('system', 'workspace-context'),
      sourceType: 'system',
      sourceId: 'workspace-context',
      name: 'Workspace Context',
      description: 'Read current workspace context, capability summary, memory metadata, projects, and Library assets.',
      status: 'available',
      statusReason: null,
      actions: [action({
        id: 'describe',
        name: 'Describe workspace',
        description: 'Return the current workspace capability summary.',
        inputSchema: emptyObjectSchema,
        outputSchema: genericObjectSchema,
        executeEndpoint: `/api/workspace/context`,
        confirmationRequired: false,
        riskLevel: 'low',
        permissions: ['workspace:read'],
        timeoutMs: 10_000,
        retryable: false,
      })],
      requiredPermissions: ['workspace:read'],
      requiredSecrets: [],
      inputSchema: emptyObjectSchema,
      outputSchema: genericObjectSchema,
      metadata: {},
    }),
    node({
      id: stableId('system', 'computer-use'),
      sourceType: 'system',
      sourceId: 'computer-use',
      name: 'Computer Use',
      description: 'Browser automation capability contract for future web interactions.',
      status: 'needs_config',
      statusReason: 'Browser automation backend is not connected to AgentOS runtime.',
      actions: [],
      requiredPermissions: ['computer:use'],
      requiredSecrets: [],
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
  node: Omit<CapabilityNode, 'createdAt' | 'updatedAt'> & { createdAt?: string; updatedAt?: string };
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
    status: capability.status,
    status_reason: capability.statusReason,
    actions: redactSecretsDeep(capability.actions),
    required_permissions: capability.requiredPermissions,
    required_secrets: redactSecretsDeep(capability.requiredSecrets),
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
      plan: [{ capabilityId: capability.id, actionId: action.id, actionName: action.name }],
      capabilityIds: [capability.id],
      requiredPermissions: [...new Set([...capability.requiredPermissions, ...action.permissions])],
      progress: capability.status === 'available' ? 10 : 0,
      metadata: { capabilitySourceType: capability.sourceType, capabilitySourceId: capability.sourceId },
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
        status: 'awaiting_confirmation',
        confirmationStatus: 'pending',
        progress: 20,
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
    return { status: 'failed', task: updated };
  }
}
