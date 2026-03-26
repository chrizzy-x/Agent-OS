import { createAgentToken } from '../auth/agent-identity.js';
import { getPublicAppUrl } from '../config/env.js';
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

function getBaseUrl(): string {
  return getPublicAppUrl().replace(/\/$/, '');
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

function normalizeAgentId(agentId: unknown): string {
  if (typeof agentId !== 'string' || typeof agentId !== 'string') {
    throw new ValidationError('agentId and name are required');
  }

  const normalized = agentId.trim();
  if (!normalized) {
    throw new ValidationError('agentId and name are required');
  }

  if (!AGENT_ID_PATTERN.test(normalized)) {
    throw new ValidationError('agentId must be lowercase alphanumeric with hyphens only');
  }

  return normalized;
}

function normalizeName(name: unknown): string {
  if (typeof name !== 'string' || !name.trim()) {
    throw new ValidationError('agentId and name are required');
  }
  return name.trim();
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

export async function getExternalAgentRegistration(agentId: string): Promise<ExternalAgentRegistrationRow | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('external_agent_registrations')
    .select('agent_id, name, description, owner_email, allowed_domains, allowed_tools, status, total_calls, last_active_at, created_at')
    .eq('agent_id', agentId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load external agent registration: ${error.message}`);
  }

  return (data as ExternalAgentRegistrationRow | null) ?? null;
}

export async function registerExternalAgent(input: RegisterExternalAgentInput): Promise<RegisterExternalAgentResult> {
  const agentId = normalizeAgentId(input.agentId);
  const name = normalizeName(input.name);
  const description = normalizeOptionalString(input.description);
  const ownerEmail = normalizeOptionalString(input.ownerEmail)?.toLowerCase() ?? null;
  const allowedDomains = normalizeAllowedDomains(input.allowedDomains);
  const allowedTools = normalizeAllowedTools(input.allowedTools);
  const supabase = getSupabaseAdmin();

  const existing = await getExternalAgentRegistration(agentId);
  if (existing) {
    const error = new Error('Agent ID already registered');
    (error as Error & { statusCode?: number }).statusCode = 409;
    throw error;
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
    if (error.code === '23505') {
      const duplicate = new Error('Agent ID already registered');
      (duplicate as Error & { statusCode?: number }).statusCode = 409;
      throw duplicate;
    }

    throw new Error('Registration failed');
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
    agentId: registration.agent_id,
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
  const supabase = getSupabaseAdmin();
  await supabase.rpc('increment_ext_agent_calls', { row_agent_id: agentId });
}

export function requireBearerToken(authHeader: string | undefined): string {
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
  if (!token) {
    throw new AuthError('Authorization: Bearer <token> header required');
  }
  return token;
}
