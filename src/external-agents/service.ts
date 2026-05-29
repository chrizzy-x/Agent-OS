import { createHmac, randomBytes } from 'crypto';
import { createAgentToken } from '../auth/agent-identity.js';
import { cleanAgentDisplayName, normalizeAgentDisplayName } from '../auth/agent-names.js';
import { getPublicAppUrl } from '../config/env.js';
import {
  readLocalRuntimeState,
  updateLocalRuntimeState,
  type LocalExternalAgentRegistrationRecord,
} from '../storage/local-state.js';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { AuthError, NotFoundError, PermissionError, ValidationError } from '../utils/errors.js';
import {
  DEFAULT_EXTERNAL_AGENT_TOOLS,
  EXTERNAL_AGENT_TOOL_SET,
} from './catalog.js';

const AGENT_ID_PATTERN = /^[a-z0-9-]+$/;
const ACTIVE_REGISTRATION_STATUS = 'active';

export interface ExternalAgentRegistrationRow {
  agent_id: string;
  name: string;
  description: string | null;
  owner_email: string | null;
  allowed_domains: string[] | null;
  allowed_tools: string[] | null;
  status: string | null;
  total_calls: number | null;
  last_active_at: string | null;
  created_at: string;
}

export interface RegisterExternalAgentInput {
  agentId?: unknown;
  name?: unknown;
  description?: unknown;
  ownerEmail?: unknown;
  allowedDomains?: unknown;
  allowedTools?: unknown;
}

export interface RegisterExternalAgentResult {
  agentId: string;
  token: string;
  expiresIn: '90d';
  allowedDomains: string[];
  allowedTools: string[];
  mcpEndpoint: string;
  toolsEndpoint: string;
  message: string;
}

export interface PublicExternalAgentRegistration {
  agentRef: string;
  name: string;
  description: string | null;
  isSubagent: boolean;
  allowed_domains: string[] | null;
  allowed_tools: string[] | null;
  status: string | null;
  total_calls: number | null;
  last_active_at: string | null;
  created_at: string;
}

function getBaseUrl(): string {
  return getPublicAppUrl().replace(/\/$/, '');
}

function getPublicRefSecret(): string {
  return process.env.AGENTOS_PUBLIC_REF_SECRET
    ?? process.env.AGENT_JWT_SECRET
    ?? process.env.JWT_SECRET
    ?? 'agentos-dev-public-ref';
}

export function createExternalAgentPublicRef(agentId: string): string {
  return `agref-${createHmac('sha256', getPublicRefSecret()).update(agentId).digest('hex').slice(0, 24)}`;
}

export function toPublicExternalAgentRegistration(
  registration: ExternalAgentRegistrationRow,
  ownerAgentId: string,
): PublicExternalAgentRegistration {
  const owner = ownerAgentId.toLowerCase();
  return {
    agentRef: createExternalAgentPublicRef(registration.agent_id),
    name: registration.name,
    description: registration.description,
    isSubagent: Boolean(registration.owner_email && registration.owner_email !== owner),
    allowed_domains: registration.allowed_domains,
    allowed_tools: registration.allowed_tools,
    status: registration.status,
    total_calls: registration.total_calls,
    last_active_at: registration.last_active_at,
    created_at: registration.created_at,
  };
}

function normalizeStringArray(value: unknown, fieldName: string): string[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an array of strings`);
  }

  const normalized = value
    .map(item => {
      if (typeof item !== 'string') {
        throw new ValidationError(`${fieldName} must be an array of strings`);
      }
      return item.trim();
    })
    .filter(Boolean);

  return [...new Set(normalized)];
}

function normalizeAllowedDomains(value: unknown): string[] {
  const domains = normalizeStringArray(value, 'allowedDomains')
    .map(domain => domain.toLowerCase());

  return domains.length > 0 ? domains : ['*'];
}

function isSkillPermission(permission: string): boolean {
  return permission === 'agentos.skill.*' || /^agentos\.skill\.[a-z0-9-]+\.[a-zA-Z0-9_.-]+$/.test(permission);
}

function isExternalMcpPermission(permission: string): boolean {
  return permission === 'mcp.*' || /^mcp\.[a-z0-9-]+\.[a-zA-Z0-9_.-]+$/.test(permission);
}

function isAgentPrimitivePermission(permission: string): boolean {
  return EXTERNAL_AGENT_TOOL_SET.has(permission);
}

function normalizeAllowedTools(value: unknown): string[] {
  const provided = normalizeStringArray(value, 'allowedTools');
  const tools = provided.length > 0 ? provided : DEFAULT_EXTERNAL_AGENT_TOOLS;

  for (const tool of tools) {
    if (!isAgentPrimitivePermission(tool) && !isExternalMcpPermission(tool) && !isSkillPermission(tool)) {
      throw new ValidationError(`Unsupported tool permission '${tool}'`);
    }
  }

  return [...new Set(tools)];
}

function slugifyAgentName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'agent';
}

function generateAgentId(name: string): string {
  return `${slugifyAgentName(name)}-${randomBytes(5).toString('hex')}`;
}

function normalizeAgentId(agentId: unknown, name: string): string {
  if (agentId === undefined || agentId === null || typeof agentId === 'string' && !agentId.trim()) {
    return generateAgentId(name);
  }

  if (typeof agentId !== 'string') {
    throw new ValidationError('Private agent reference must be lowercase alphanumeric with hyphens only');
  }

  const normalized = agentId.trim();

  if (!AGENT_ID_PATTERN.test(normalized)) {
    throw new ValidationError('Private agent reference must be lowercase alphanumeric with hyphens only');
  }

  return normalized;
}

function normalizeName(name: unknown): string {
  if (typeof name !== 'string' || !name.trim()) {
    throw new ValidationError('name is required');
  }
  return cleanAgentDisplayName(name);
}

function duplicateAgentNameError(name: string): Error {
  const error = new Error(`Agent name already exists: ${name}`);
  (error as Error & { statusCode?: number }).statusCode = 409;
  return error;
}

function duplicateAgentIdError(): Error {
  const error = new Error('Agent already registered');
  (error as Error & { statusCode?: number }).statusCode = 409;
  return error;
}

function inferAgentInsertDuplicate(error: { message?: string; details?: string; hint?: string }, name: string): Error {
  const text = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase();
  return text.includes('name') ? duplicateAgentNameError(name) : duplicateAgentIdError();
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function matchesPermission(permission: string, toolName: string): boolean {
  if (permission === toolName) {
    return true;
  }

  if (!permission.endsWith('.*')) {
    return false;
  }

  const prefix = permission.slice(0, -1);
  return toolName.startsWith(prefix);
}

function toExternalAgentRegistration(
  registration: LocalExternalAgentRegistrationRecord,
): ExternalAgentRegistrationRow {
  return {
    agent_id: registration.agent_id,
    name: registration.name,
    description: registration.description,
    owner_email: registration.owner_email,
    allowed_domains: registration.allowed_domains,
    allowed_tools: registration.allowed_tools,
    status: registration.status,
    total_calls: registration.total_calls,
    last_active_at: registration.last_active_at,
    created_at: registration.created_at,
  };
}

function buildExternalAgentRegistrationRecord(
  registration: ExternalAgentRegistrationRow,
): LocalExternalAgentRegistrationRecord {
  return {
    agent_id: registration.agent_id,
    name: registration.name,
    description: registration.description,
    owner_email: registration.owner_email,
    allowed_domains: registration.allowed_domains ?? [],
    allowed_tools: registration.allowed_tools ?? [],
    status: registration.status ?? ACTIVE_REGISTRATION_STATUS,
    total_calls: registration.total_calls ?? 0,
    last_active_at: registration.last_active_at,
    created_at: registration.created_at,
  };
}

async function getLocalExternalAgentRegistration(agentId: string): Promise<ExternalAgentRegistrationRow | null> {
  const state = await readLocalRuntimeState();
  const registration = state.externalAgents[agentId];
  return registration ? toExternalAgentRegistration(registration) : null;
}

async function writeLocalExternalAgentRegistration(registration: ExternalAgentRegistrationRow): Promise<void> {
  await updateLocalRuntimeState(state => {
    state.externalAgents[registration.agent_id] = buildExternalAgentRegistrationRecord(registration);
  });
}

export function normalizeRequestedToolName(toolName: string): string {
  const normalized = toolName.trim();
  if (!normalized) {
    return normalized;
  }

  if (
    normalized.startsWith('agentos.') ||
    normalized.startsWith('mcp.') ||
    normalized.startsWith('agentos.skill.')
  ) {
    return normalized;
  }

  if (normalized.startsWith('skill.')) {
    return `agentos.${normalized}`;
  }

  const primitiveAlias = `agentos.${normalized}`;
  if (EXTERNAL_AGENT_TOOL_SET.has(primitiveAlias)) {
    return primitiveAlias;
  }

  return normalized;
}

export async function listExternalAgents(ownerAgentId: string): Promise<ExternalAgentRegistrationRow[]> {
  const normalizedOwner = ownerAgentId.toLowerCase();
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('external_agent_registrations')
      .select('agent_id, name, description, owner_email, allowed_domains, allowed_tools, status, total_calls, last_active_at, created_at')
      .eq('owner_email', normalizedOwner)
      .order('created_at', { ascending: false });
    if (!error && data) {
      const byId = new Map<string, ExternalAgentRegistrationRow>();
      let frontier = data as ExternalAgentRegistrationRow[];
      for (let depth = 0; depth < 5 && frontier.length > 0; depth += 1) {
        frontier.forEach(agent => byId.set(agent.agent_id, agent));
        const nextOwners = frontier.map(agent => agent.agent_id).filter(agentId => !byId.has(`${agentId}:queried`));
        nextOwners.forEach(agentId => byId.set(`${agentId}:queried`, {} as ExternalAgentRegistrationRow));
        const { data: children } = nextOwners.length > 0
          ? await supabase
            .from('external_agent_registrations')
            .select('agent_id, name, description, owner_email, allowed_domains, allowed_tools, status, total_calls, last_active_at, created_at')
            .in('owner_email', nextOwners)
            .order('created_at', { ascending: false })
          : { data: [] };
        frontier = (children ?? []) as ExternalAgentRegistrationRow[];
      }
      for (const key of [...byId.keys()]) {
        if (key.endsWith(':queried')) byId.delete(key);
      }
      return [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
  } catch { /* fall through to local */ }

  const state = await readLocalRuntimeState();
  const all = Object.values(state.externalAgents);
  const visibleOwnerIds = new Set([normalizedOwner]);
  for (let depth = 0; depth < 5; depth += 1) {
    let added = false;
    for (const agent of all) {
      if (agent.owner_email && visibleOwnerIds.has(agent.owner_email) && !visibleOwnerIds.has(agent.agent_id)) {
        visibleOwnerIds.add(agent.agent_id);
        added = true;
      }
    }
    if (!added) break;
  }
  return all
    .filter(r => r.owner_email !== null && visibleOwnerIds.has(r.owner_email))
    .map(toExternalAgentRegistration)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function resolveVisibleExternalAgentRef(
  ownerAgentId: string,
  ref: string,
): Promise<ExternalAgentRegistrationRow | null> {
  const decodedRef = decodeURIComponent(ref).trim();
  const normalizedName = normalizeAgentDisplayName(decodedRef);
  const agents = await listExternalAgents(ownerAgentId);

  return agents.find(agent => (
    createExternalAgentPublicRef(agent.agent_id) === decodedRef
    || agent.agent_id === decodedRef
    || normalizeAgentDisplayName(agent.name) === normalizedName
  )) ?? null;
}

export async function getExternalAgentRegistration(agentId: string): Promise<ExternalAgentRegistrationRow | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('external_agent_registrations')
      .select('agent_id, name, description, owner_email, allowed_domains, allowed_tools, status, total_calls, last_active_at, created_at')
      .eq('agent_id', agentId)
      .maybeSingle();

    if (!error && data) {
      const registration = data as ExternalAgentRegistrationRow;
      await writeLocalExternalAgentRegistration(registration);
      return registration;
    }

    if (!error) {
      // Supabase is available and reports agent not found — return null authoritatively.
      return null;
    }
  } catch {
    // Supabase unavailable — fall back to local state.
  }

  return await getLocalExternalAgentRegistration(agentId);
}

export async function registerExternalAgent(input: RegisterExternalAgentInput): Promise<RegisterExternalAgentResult> {
  const name = normalizeName(input.name);
  const agentId = normalizeAgentId(input.agentId, name);
  const description = normalizeOptionalString(input.description);
  const ownerEmail = normalizeOptionalString(input.ownerEmail)?.toLowerCase() ?? null;
  const allowedDomains = normalizeAllowedDomains(input.allowedDomains);
  const allowedTools = normalizeAllowedTools(input.allowedTools);
  const registration: ExternalAgentRegistrationRow = {
    agent_id: agentId,
    name,
    description,
    owner_email: ownerEmail,
    allowed_domains: allowedDomains,
    allowed_tools: allowedTools,
    status: ACTIVE_REGISTRATION_STATUS,
    total_calls: 0,
    last_active_at: null,
    created_at: new Date().toISOString(),
  };

  const existing = await getExternalAgentRegistration(agentId);
  if (existing) {
    throw duplicateAgentIdError();
  }

  let supabaseSucceeded = false;
  try {
    const supabase = getSupabaseAdmin();
    const agentInsert = await supabase
      .from('agents')
      .insert({
        id: agentId,
        name,
        metadata: { externalAgent: true, ownerAgentId: ownerEmail },
        updated_at: new Date().toISOString(),
      });

    if (agentInsert.error) {
      if (agentInsert.error.code === '23505') {
        throw inferAgentInsertDuplicate(agentInsert.error, name);
      }
      throw agentInsert.error;
    }

    const { error } = await supabase
      .from('external_agent_registrations')
      .insert({
        agent_id: agentId,
        name,
        description,
        owner_email: ownerEmail,
        allowed_domains: allowedDomains,
        allowed_tools: allowedTools,
        status: ACTIVE_REGISTRATION_STATUS,
      });

    if (error) {
      await supabase.from('agents').delete().eq('id', agentId);
      if (error.code === '23505') {
        throw inferAgentInsertDuplicate(error, name);
      }

      throw error;
    }
    supabaseSucceeded = true;
  } catch (error) {
    const duplicateError = error as { code?: string; statusCode?: number };
    if (duplicateError.code === '23505' || duplicateError.statusCode === 409) {
      throw error;
    }
    // Supabase unavailable — fall through to local registration below.
  }

  if (supabaseSucceeded) {
    // Supabase insert succeeded — just cache in local state (overwrite any stale data).
    await updateLocalRuntimeState(state => {
      state.externalAgents[agentId] = buildExternalAgentRegistrationRecord(registration);
    });
  } else {
    // Supabase unavailable — register locally with duplicate check as fallback.
    const duplicate = await updateLocalRuntimeState<'id' | 'name' | false>(state => {
      if (state.externalAgents[agentId]) {
        return 'id';
      }
      const normalizedName = normalizeAgentDisplayName(name);
      if (normalizedName) {
        const accountNameExists = Object.values(state.accounts)
          .some(account => normalizeAgentDisplayName(account.agentName) === normalizedName);
        const externalNameExists = Object.values(state.externalAgents)
          .some(agent => normalizeAgentDisplayName(agent.name) === normalizedName);
        if (accountNameExists || externalNameExists) return 'name';
      }
      state.externalAgents[agentId] = buildExternalAgentRegistrationRecord(registration);
      return false;
    });

    if (duplicate) {
      throw duplicate === 'name' ? duplicateAgentNameError(name) : duplicateAgentIdError();
    }
  }

  return {
    agentId,
    token: createAgentToken(agentId, { allowedDomains, expiresIn: '90d' }),
    expiresIn: '90d',
    allowedDomains,
    allowedTools,
    mcpEndpoint: `${getBaseUrl()}/mcp`,
    toolsEndpoint: `${getBaseUrl()}/tools`,
    message: 'Store this token securely. It will not be shown again.',
  };
}

export async function getExternalAgentProfile(agentId: string) {
  const registration = await getExternalAgentRegistration(agentId);
  if (!registration) {
    throw new NotFoundError('Agent not found. Use /register first.');
  }

  return {
    name: registration.name,
    status: registration.status ?? ACTIVE_REGISTRATION_STATUS,
    allowedDomains: registration.allowed_domains ?? [],
    allowedTools: registration.allowed_tools ?? [],
    totalCalls: registration.total_calls ?? 0,
    lastActiveAt: registration.last_active_at,
    createdAt: registration.created_at,
    mcpEndpoint: `${getBaseUrl()}/mcp`,
    toolsEndpoint: `${getBaseUrl()}/tools`,
  };
}

export async function assertExternalAgentToolAccess(agentId: string, toolName: string): Promise<void> {
  const registration = await getExternalAgentRegistration(agentId);
  if (!registration) {
    return;
  }

  if ((registration.status ?? ACTIVE_REGISTRATION_STATUS) !== ACTIVE_REGISTRATION_STATUS) {
    throw new PermissionError('Agent registration is not active');
  }

  const normalizedTool = normalizeRequestedToolName(toolName);
  const allowedTools = registration.allowed_tools ?? [];
  const isAllowed = allowedTools.some(permission => matchesPermission(permission, normalizedTool));

  if (!isAllowed) {
    throw new PermissionError(`Tool '${normalizedTool}' is not allowed for this agent`);
  }
}

export async function trackExternalAgentCall(agentId: string): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.rpc('increment_ext_agent_calls', { row_agent_id: agentId });
    return;
  } catch {
    await updateLocalRuntimeState(state => {
      const registration = state.externalAgents[agentId];
      if (!registration) {
        return;
      }

      registration.total_calls += 1;
      registration.last_active_at = new Date().toISOString();
    });
  }
}

export function requireBearerToken(authHeader: string | undefined): string {
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
  if (!token) {
    throw new AuthError('Authorization: Bearer <token> header required');
  }
  return token;
}
