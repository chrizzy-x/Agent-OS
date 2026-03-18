import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getPublicAppUrl } from '../config/env.js';
import { listUniversalMcpTools, executeUniversalToolCall } from '../mcp/registry.js';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { getRedisClient, agentKey } from '../storage/redis.js';
import { runInstalledSkill } from '../skills/service.js';
import { STUDIO_COMMAND_DEFINITIONS } from './catalog.js';
import type { StudioCommandResponse, StudioPreview } from './types.js';
import type { AgentContext } from '../auth/permissions.js';
import { ValidationError, NotFoundError, PermissionError } from '../utils/errors.js';

type ParsedStudioCommand =
  | { type: 'help' }
  | { type: 'agent-status' }
  | { type: 'tools-list' }
  | { type: 'tool-run'; toolName: string; input: Record<string, unknown> }
  | { type: 'mcp-list' }
  | { type: 'mcp-call'; server: string; toolName: string; input: Record<string, unknown> }
  | { type: 'skills-search'; query: string }
  | { type: 'skills-install'; reference: string }
  | { type: 'skills-use'; skillSlug: string; capability: string; input: Record<string, unknown> }
  | { type: 'scaffold-agent'; template: string }
  | { type: 'deploy-snippet' }
  | { type: 'advanced-run'; language: 'python' | 'javascript' | 'bash'; code: string };

type SkillSummary = {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  description: string | null;
  pricing_model?: string | null;
  total_installs?: number | null;
};

const STUDIO_CONFIRM_TTL_SECONDS = 5 * 60;
const APP_URL = getPublicAppUrl();

const READ_ONLY_TOOLS = new Set([
  'mem_get',
  'mem_list',
  'fs_read',
  'fs_list',
  'fs_stat',
  'db_query',
  'net_http_get',
  'net_dns_resolve',
  'events_subscribe',
  'events_list_topics',
  'proc_list',
]);

const SCAFFOLD_TEMPLATES: Record<string, {
  summary: string;
  files: Array<{ path: string; contentType: string; content: string }>;
}> = {
  starter: {
    summary: 'General-purpose starter with an agent brief, config, and first API example.',
    files: [
      {
        path: '/studio/starter/README.md',
        contentType: 'text/markdown',
        content: `# Agent Starter

Purpose: Define what this agent should do, what it should avoid, and how it should be tested.

## First objectives
- Describe the business workflow this agent owns.
- List the primitives or skills it is allowed to use.
- Define success and rollback conditions before you automate anything critical.
`,
      },
      {
        path: '/studio/starter/agent-spec.json',
        contentType: 'application/json',
        content: JSON.stringify({
          name: 'Starter Agent',
          goal: 'Describe the workflow before implementing runtime logic.',
          primitives: ['mem', 'fs', 'db', 'net', 'events'],
          checks: ['Define success metrics', 'Document external dependencies'],
        }, null, 2),
      },
      {
        path: '/studio/starter/examples/first-call.js',
        contentType: 'application/javascript',
        content: `const API_KEY = process.env.AGENT_OS_KEY;
const APP_URL = '${APP_URL}';

async function mcp(tool, input) {
  const res = await fetch(\`\${APP_URL}/mcp\`, {
    method: 'POST',
    headers: {
      Authorization: \`Bearer \${API_KEY}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tool, input }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Agent OS error');
  return body.result;
}

await mcp('mem_set', { key: 'hello', value: 'world' });
`,
      },
    ],
  },
  research: {
    summary: 'Research-focused starter with source logging and evidence storage.',
    files: [
      {
        path: '/studio/research/README.md',
        contentType: 'text/markdown',
        content: `# Research Agent

This starter is for evidence-driven research workflows.

## Workflow
1. Pull or receive source material.
2. Store source notes in files.
3. Persist extracted facts in the database.
4. Emit a final summary only after evidence checks pass.
`,
      },
      {
        path: '/studio/research/agent-spec.json',
        contentType: 'application/json',
        content: JSON.stringify({
          name: 'Research Agent',
          goal: 'Collect, verify, and summarize evidence-backed findings.',
          primitives: ['fs', 'db', 'net'],
          outputs: ['research notes', 'evidence table', 'final brief'],
        }, null, 2),
      },
      {
        path: '/studio/research/examples/query.sql',
        contentType: 'text/plain',
        content: 'SELECT source_url, extracted_claim, confidence FROM findings ORDER BY created_at DESC LIMIT 20;',
      },
    ],
  },
  automation: {
    summary: 'Automation starter for queue-driven operational workflows.',
    files: [
      {
        path: '/studio/automation/README.md',
        contentType: 'text/markdown',
        content: `# Automation Agent

Use this starter for business operations and repetitive workflow execution.

## Guardrails
- Validate inputs before touching external systems.
- Log every side effect.
- Prefer preview and dry-run modes for destructive actions.
`,
      },
      {
        path: '/studio/automation/agent-spec.json',
        contentType: 'application/json',
        content: JSON.stringify({
          name: 'Automation Agent',
          goal: 'Run repeatable operational tasks with clear approvals.',
          primitives: ['events', 'db', 'net', 'proc'],
          alerts: ['Notify on failed runs', 'Record retry counts'],
        }, null, 2),
      },
      {
        path: '/studio/automation/examples/schedule.js',
        contentType: 'application/javascript',
        content: `await fetch('${APP_URL}/mcp', {
  method: 'POST',
  headers: {
    Authorization: \`Bearer \${process.env.AGENT_OS_KEY}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    tool: 'proc_schedule',
    input: {
      code: 'console.log("nightly job")',
      language: 'javascript',
      cronExpression: '0 0 * * *',
    },
  }),
});`,
      },
    ],
  },
};

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return secret;
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function normalizeCommandForSigning(command: string, advancedMode: boolean): string {
  return `${command.trim()}::advanced:${advancedMode ? '1' : '0'}`;
}

function extractPayload(command: string): { head: string; payloadType: 'json' | 'code' | null; payload: string | null } {
  const match = /\s--(json|code)\s/.exec(command);
  if (!match || match.index === undefined) {
    return { head: command.trim(), payloadType: null, payload: null };
  }

  const head = command.slice(0, match.index).trim();
  const payload = command.slice(match.index + match[0].length).trim();
  if (!payload) {
    throw new ValidationError(`--${match[1]} requires a payload`);
  }

  return {
    head,
    payloadType: match[1] as 'json' | 'code',
    payload,
  };
}

function assertNoShellSyntax(head: string): void {
  const bannedPatterns = [
    '&&',
    '||',
    ';',
    '|',
    '>',
    '<',
    '$(',
    '`',
  ];

  for (const pattern of bannedPatterns) {
    if (head.includes(pattern)) {
      throw new ValidationError('Studio commands do not support shell syntax, pipes, redirects, or chained commands');
    }
  }
}

function parseJsonPayload(raw: string | null): Record<string, unknown> {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ValidationError('JSON payload must be an object');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError('Invalid JSON payload for Studio command');
  }
}

function requireSingleToken(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) {
    throw new ValidationError(`${label} must be a single token`);
  }
  return trimmed;
}

export function parseStudioCommand(command: string): ParsedStudioCommand {
  const trimmed = command.trim();
  if (!trimmed) {
    throw new ValidationError('Studio command is required');
  }

  if (trimmed.length > 100_000) {
    throw new ValidationError('Studio command exceeds the maximum supported size');
  }

  const { head, payloadType, payload } = extractPayload(trimmed);
  assertNoShellSyntax(head);

  if (head === 'help') return { type: 'help' };
  if (head === 'agent status') return { type: 'agent-status' };
  if (head === 'tools list') return { type: 'tools-list' };
  if (head === 'mcp list') return { type: 'mcp-list' };
  if (head === 'deploy snippet') return { type: 'deploy-snippet' };

  if (head.startsWith('tool run ')) {
    if (payloadType && payloadType !== 'json') {
      throw new ValidationError('tool run only supports --json payloads');
    }
    return {
      type: 'tool-run',
      toolName: requireSingleToken(head.slice('tool run '.length), 'Tool name'),
      input: parseJsonPayload(payload),
    };
  }

  if (head.startsWith('mcp call ')) {
    if (payloadType && payloadType !== 'json') {
      throw new ValidationError('mcp call only supports --json payloads');
    }

    const parts = head.slice('mcp call '.length).trim().split(/\s+/);
    if (parts.length !== 2) {
      throw new ValidationError('mcp call requires exactly <server> <tool>');
    }

    return {
      type: 'mcp-call',
      server: parts[0],
      toolName: parts[1],
      input: parseJsonPayload(payload),
    };
  }

  if (head.startsWith('skills search ')) {
    const query = head.slice('skills search '.length).trim();
    if (!query) {
      throw new ValidationError('skills search requires a query');
    }
    return { type: 'skills-search', query };
  }

  if (head.startsWith('skills install ')) {
    return {
      type: 'skills-install',
      reference: requireSingleToken(head.slice('skills install '.length), 'Skill reference'),
    };
  }

  if (head.startsWith('skills use ')) {
    if (payloadType && payloadType !== 'json') {
      throw new ValidationError('skills use only supports --json payloads');
    }

    const parts = head.slice('skills use '.length).trim().split(/\s+/);
    if (parts.length !== 2) {
      throw new ValidationError('skills use requires exactly <slug> <capability>');
    }

    return {
      type: 'skills-use',
      skillSlug: parts[0],
      capability: parts[1],
      input: parseJsonPayload(payload),
    };
  }

  if (head.startsWith('scaffold agent ')) {
    return {
      type: 'scaffold-agent',
      template: requireSingleToken(head.slice('scaffold agent '.length), 'Template'),
    };
  }

  if (head.startsWith('advanced run ')) {
    if (payloadType !== 'code') {
      throw new ValidationError('advanced run requires a --code payload');
    }

    const language = requireSingleToken(head.slice('advanced run '.length), 'Language');
    if (language !== 'python' && language !== 'javascript' && language !== 'bash') {
      throw new ValidationError('advanced run supports python, javascript, or bash');
    }

    return { type: 'advanced-run', language, code: payload ?? '' };
  }

  throw new ValidationError(`Unsupported Studio command: ${trimmed}`);
}

export function isMutatingStudioCommand(parsed: ParsedStudioCommand): boolean {
  switch (parsed.type) {
    case 'help':
    case 'agent-status':
    case 'tools-list':
    case 'mcp-list':
    case 'skills-search':
    case 'deploy-snippet':
      return false;
    case 'tool-run':
      return !READ_ONLY_TOOLS.has(parsed.toolName.replace(/^agentos\./, ''));
    default:
      return true;
  }
}

async function createStudioConfirmToken(agentId: string, command: string, advancedMode: boolean): Promise<string> {
  const nonce = crypto.randomUUID();
  const commandHash = sha256(normalizeCommandForSigning(command, advancedMode));
  const key = agentKey('studio-confirm', agentId, nonce);
  await getRedisClient().set(key, commandHash, 'EX', STUDIO_CONFIRM_TTL_SECONDS);

  return jwt.sign(
    { sub: agentId, scope: 'studio-confirm', nonce, hash: commandHash },
    getJwtSecret(),
    { expiresIn: STUDIO_CONFIRM_TTL_SECONDS },
  );
}

export async function consumeStudioConfirmToken(params: {
  agentId: string;
  command: string;
  advancedMode: boolean;
  token: string;
}): Promise<void> {
  let payload: { sub?: string; scope?: string; nonce?: string; hash?: string };

  try {
    payload = jwt.verify(params.token, getJwtSecret()) as { sub?: string; scope?: string; nonce?: string; hash?: string };
  } catch {
    throw new ValidationError('Studio confirmation token is invalid or expired');
  }

  if (payload.scope !== 'studio-confirm' || payload.sub !== params.agentId || !payload.nonce || !payload.hash) {
    throw new ValidationError('Studio confirmation token does not match this agent session');
  }

  const expectedHash = sha256(normalizeCommandForSigning(params.command, params.advancedMode));
  if (payload.hash !== expectedHash) {
    throw new ValidationError('Studio confirmation token does not match the current command');
  }

  const key = agentKey('studio-confirm', params.agentId, payload.nonce);
  const cachedHash = await getRedisClient().get(key);
  if (!cachedHash || cachedHash !== expectedHash) {
    throw new ValidationError('Studio confirmation token has already been used or expired');
  }

  await getRedisClient().del(key);
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function buildFetchSnippet(path: string, body: Record<string, unknown>, tokenVar = 'API_KEY'): string {
  return `const API_KEY = process.env.AGENT_OS_KEY ?? '${tokenVar}';

const response = await fetch('${APP_URL}${path}', {
  method: 'POST',
  headers: {
    Authorization: \`Bearer \${API_KEY}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(${formatJson(body)}),
});

const data = await response.json();
if (!response.ok) throw new Error(data.error || 'Agent OS error');
console.log(data);`;
}

function buildHelperSnippet(): string {
  return `const AGENT_OS_URL = '${APP_URL}';
const API_KEY = process.env.AGENT_OS_KEY;

async function mcp(tool, input) {
  const response = await fetch(\`\${AGENT_OS_URL}/mcp\`, {
    method: 'POST',
    headers: {
      Authorization: \`Bearer \${API_KEY}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tool, input }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Agent OS error');
  return data.result;
}`;
}

function buildToolSnippet(toolName: string, input: Record<string, unknown>): string {
  return `${buildHelperSnippet()}

const result = await mcp('${toolName}', ${formatJson(input)});
console.log(result);`;
}

function buildSkillInstallSnippet(skillId: string): string {
  return buildFetchSnippet('/api/skills/install', { skill_id: skillId });
}

function buildSkillUseSnippet(skillSlug: string, capability: string, input: Record<string, unknown>): string {
  return buildFetchSnippet('/api/skills/use', {
    skill_slug: skillSlug,
    capability,
    params: input,
  });
}

function buildDeploySnippet(): string {
  return `${buildHelperSnippet()}

await mcp('mem_set', { key: 'hello', value: 'world' });
await mcp('db_create_table', {
  table: 'events',
  schema: [
    { column: 'id', type: 'uuid', primaryKey: true },
    { column: 'type', type: 'text', nullable: false },
    { column: 'created_at', type: 'timestamptz', nullable: false },
  ],
});`;
}

async function resolveSkill(reference: string): Promise<SkillSummary> {
  const supabase = getSupabaseAdmin();
  const skillFields = 'id,slug,name,category,description,pricing_model,total_installs,published';

  const bySlug = await supabase
    .from('skills')
    .select(skillFields)
    .eq('slug', reference)
    .eq('published', true)
    .single();

  if (!bySlug.error && bySlug.data) {
    return bySlug.data as SkillSummary;
  }

  const byId = await supabase
    .from('skills')
    .select(skillFields)
    .eq('id', reference)
    .eq('published', true)
    .single();

  if (!byId.error && byId.data) {
    return byId.data as SkillSummary;
  }

  throw new NotFoundError(`Published skill '${reference}' was not found`);
}

async function listInstalledSkillCount(agentId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('skill_installations')
    .select('id')
    .eq('agent_id', agentId);

  if (error) {
    throw new Error(`Failed to load installed skills: ${error.message}`);
  }

  return data?.length ?? 0;
}

async function searchSkills(query: string): Promise<SkillSummary[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('skills')
    .select('id,slug,name,category,description,pricing_model,total_installs,published,tags')
    .eq('published', true)
    .order('total_installs', { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(`Skill search failed: ${error.message}`);
  }

  const needle = query.trim().toLowerCase();
  return (data ?? [])
    .filter((skill: Record<string, unknown>) => {
      const haystack = [
        skill.name,
        skill.description,
        skill.category,
        ...(Array.isArray(skill.tags) ? skill.tags : []),
      ]
        .filter((value): value is string => typeof value === 'string')
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    })
    .slice(0, 12) as SkillSummary[];
}

async function installSkill(agentId: string, skillId: string): Promise<{ installed: boolean; skillId: string }> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('skill_installations')
    .insert({ agent_id: agentId, skill_id: skillId });

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new ValidationError('Skill is already installed for this agent');
    }
    throw new Error(`Skill installation failed: ${error.message}`);
  }

  return { installed: true, skillId };
}

async function buildAgentStatus(agentContext: AgentContext): Promise<Record<string, unknown>> {
  const [tools, installedSkillCount] = await Promise.all([
    listUniversalMcpTools(),
    listInstalledSkillCount(agentContext.agentId),
  ]);

  return {
    agentId: agentContext.agentId,
    allowedDomains: agentContext.allowedDomains,
    quotas: agentContext.quotas,
    installedSkills: installedSkillCount,
    availableTools: tools.length,
  };
}

async function buildMcpList(): Promise<Record<string, unknown>> {
  const [tools, serversResult] = await Promise.all([
    listUniversalMcpTools(),
    getSupabaseAdmin()
      .from('mcp_servers')
      .select('name,description,category,icon,requires_consensus,consensus_threshold')
      .eq('active', true)
      .order('name', { ascending: true }),
  ]);

  return {
    servers: serversResult.data ?? [],
    tools: tools.filter(tool => tool.source === 'external'),
  };
}

function buildPreviewResponse(command: string, preview: StudioPreview, confirmToken: string, summary: string, warnings: string[]): StudioCommandResponse {
  return {
    kind: 'preview',
    command,
    mutating: true,
    summary,
    confirmToken,
    preview,
    warnings,
  };
}

async function previewMutatingCommand(params: {
  agentContext: AgentContext;
  command: string;
  parsed: ParsedStudioCommand;
  advancedMode: boolean;
}): Promise<StudioCommandResponse> {
  const confirmToken = await createStudioConfirmToken(params.agentContext.agentId, params.command, params.advancedMode);

  switch (params.parsed.type) {
    case 'tool-run': {
      const toolName = params.parsed.toolName.replace(/^agentos\./, '');
      return buildPreviewResponse(
        params.command,
        {
          action: 'tool.run',
          target: params.parsed.toolName,
          payloadSummary: formatJson(params.parsed.input),
          risks: ['This tool can change persistent agent state or trigger an external side effect.'],
        },
        confirmToken,
        `Previewing ${params.parsed.toolName} before execution`,
        [`${toolName} is treated as a mutating Studio command.`],
      );
    }
    case 'mcp-call':
      return buildPreviewResponse(
        params.command,
        {
          action: 'mcp.call',
          target: `${params.parsed.server}.${params.parsed.toolName}`,
          payloadSummary: formatJson(params.parsed.input),
          risks: ['External MCP actions may send messages, mutate remote systems, or trigger consensus checks.'],
        },
        confirmToken,
        `Previewing external MCP call ${params.parsed.server}.${params.parsed.toolName}`,
        ['External MCP calls are always previewed before execution.'],
      );
    case 'skills-install': {
      const skill = await resolveSkill(params.parsed.reference);
      return buildPreviewResponse(
        params.command,
        {
          action: 'skills.install',
          target: `${skill.slug} (${skill.id})`,
          payloadSummary: skill.description ?? 'Install the selected marketplace skill.',
          risks: ['This will attach the skill to the current agent and make its capabilities callable.'],
        },
        confirmToken,
        `Previewing install for ${skill.name}`,
        ['Installing a skill changes the agent capability set.'],
      );
    }
    case 'skills-use':
      return buildPreviewResponse(
        params.command,
        {
          action: 'skills.use',
          target: `${params.parsed.skillSlug}.${params.parsed.capability}`,
          payloadSummary: formatJson(params.parsed.input),
          risks: ['Skill execution may read/write agent resources depending on the skill implementation.'],
        },
        confirmToken,
        `Previewing skill execution ${params.parsed.skillSlug}.${params.parsed.capability}`,
        ['Skill execution is previewed in Studio before it runs.'],
      );
    case 'scaffold-agent': {
      const template = SCAFFOLD_TEMPLATES[params.parsed.template];
      if (!template) {
        throw new ValidationError(`Unknown scaffold template '${params.parsed.template}'. Try starter, research, or automation.`);
      }
      return buildPreviewResponse(
        params.command,
        {
          action: 'scaffold.agent',
          target: params.parsed.template,
          payloadSummary: template.files.map(file => file.path).join('\n'),
          risks: ['This will write starter files into the current agent filesystem.'],
        },
        confirmToken,
        `Previewing scaffold template '${params.parsed.template}'`,
        ['Scaffolding writes multiple files into agent storage.'],
      );
    }
    case 'advanced-run':
      if (!params.advancedMode) {
        throw new PermissionError('Advanced mode must be enabled for this browser session before sandbox code can run');
      }
      return buildPreviewResponse(
        params.command,
        {
          action: 'advanced.run',
          target: params.parsed.language,
          payloadSummary: params.parsed.code.slice(0, 400),
          risks: [
            'Sandboxed code has different network and filesystem characteristics than the net_* and fs_* primitives.',
            'Only enable this for deliberate debugging or controlled experiments.',
          ],
        },
        confirmToken,
        `Previewing advanced ${params.parsed.language} sandbox execution`,
        ['Advanced mode is opt-in per browser session and expires after 15 minutes.'],
      );
    default:
      throw new ValidationError('Studio command preview is not supported for this command');
  }
}

function buildSnippetForParsedCommand(parsed: ParsedStudioCommand): string {
  switch (parsed.type) {
    case 'help':
      return buildHelperSnippet();
    case 'agent-status':
      return `const tools = await fetch('${APP_URL}/tools').then(res => res.json());\nconsole.log(tools.tools.length);`;
    case 'tools-list':
      return `const tools = await fetch('${APP_URL}/tools').then(res => res.json());\nconsole.log(tools.tools);`;
    case 'tool-run':
      return buildToolSnippet(parsed.toolName, parsed.input);
    case 'mcp-list':
      return `const registry = await fetch('${APP_URL}/api/mcp').then(res => res.json());\nconsole.log(registry.servers, registry.tools);`;
    case 'mcp-call':
      return buildFetchSnippet('/api/mcp', {
        method: 'tools/call',
        params: {
          server: parsed.server,
          name: parsed.toolName,
          arguments: parsed.input,
        },
      });
    case 'skills-search':
      return `const skills = await fetch('${APP_URL}/api/skills?search=${encodeURIComponent(parsed.query)}').then(res => res.json());\nconsole.log(skills.skills);`;
    case 'skills-install':
      return buildFetchSnippet('/api/skills/install', { skill_id: '<skill-uuid>' });
    case 'skills-use':
      return buildSkillUseSnippet(parsed.skillSlug, parsed.capability, parsed.input);
    case 'scaffold-agent':
      return buildToolSnippet('fs_write', {
        path: `/studio/${parsed.template}/README.md`,
        data: Buffer.from('# Starter').toString('base64'),
        contentType: 'text/markdown',
      });
    case 'deploy-snippet':
      return buildDeploySnippet();
    case 'advanced-run':
      return buildToolSnippet('proc_execute', {
        language: parsed.language,
        code: parsed.code,
        timeout: 30000,
      });
  }
}

async function executeParsedCommand(params: {
  agentContext: AgentContext;
  parsed: ParsedStudioCommand;
}): Promise<{ summary: string; result: unknown; warnings?: string[]; snippet: string }> {
  switch (params.parsed.type) {
    case 'help':
      return {
        summary: `Studio supports ${STUDIO_COMMAND_DEFINITIONS.length} guided commands`,
        result: { commands: STUDIO_COMMAND_DEFINITIONS },
        snippet: buildHelperSnippet(),
      };
    case 'agent-status': {
      const result = await buildAgentStatus(params.agentContext);
      return {
        summary: `Loaded status for ${params.agentContext.agentId}`,
        result,
        snippet: buildSnippetForParsedCommand(params.parsed),
      };
    }
    case 'tools-list': {
      const result = await listUniversalMcpTools();
      return {
        summary: `Loaded ${result.length} tools from the universal registry`,
        result: { tools: result },
        snippet: buildSnippetForParsedCommand(params.parsed),
      };
    }
    case 'tool-run': {
      const result = await executeUniversalToolCall({
        agentContext: params.agentContext,
        name: params.parsed.toolName,
        arguments: params.parsed.input,
      });
      return {
        summary: `Executed ${params.parsed.toolName}`,
        result,
        snippet: buildSnippetForParsedCommand(params.parsed),
      };
    }
    case 'mcp-list': {
      const result = await buildMcpList();
      return {
        summary: `Loaded ${((result as { servers: unknown[] }).servers ?? []).length} active MCP servers`,
        result,
        snippet: buildSnippetForParsedCommand(params.parsed),
      };
    }
    case 'mcp-call': {
      const result = await executeUniversalToolCall({
        agentContext: params.agentContext,
        name: params.parsed.toolName,
        server: params.parsed.server,
        arguments: params.parsed.input,
      });
      return {
        summary: `Executed external MCP call ${params.parsed.server}.${params.parsed.toolName}`,
        result,
        warnings: ['This command was routed through the external MCP execution path.'],
        snippet: buildSnippetForParsedCommand(params.parsed),
      };
    }
    case 'skills-search': {
      const result = await searchSkills(params.parsed.query);
      return {
        summary: `Found ${result.length} skill matches for '${params.parsed.query}'`,
        result: { skills: result },
        snippet: buildSnippetForParsedCommand(params.parsed),
      };
    }
    case 'skills-install': {
      const skill = await resolveSkill(params.parsed.reference);
      const result = await installSkill(params.agentContext.agentId, skill.id);
      return {
        summary: `Installed ${skill.name}`,
        result: { ...result, skill },
        warnings: ['The skill is now available to this agent in dashboard, marketplace, and Studio.'],
        snippet: buildSkillInstallSnippet(skill.id),
      };
    }
    case 'skills-use': {
      const execution = await runInstalledSkill({
        agentId: params.agentContext.agentId,
        skillSlug: params.parsed.skillSlug,
        capability: params.parsed.capability,
        input: params.parsed.input,
      });
      return {
        summary: `Executed ${params.parsed.skillSlug}.${params.parsed.capability}`,
        result: {
          result: execution.result,
          execution_time_ms: execution.executionTimeMs,
          stderr: execution.stderr,
        },
        warnings: execution.stderr ? ['The skill returned stderr output. Review the execution result carefully.'] : undefined,
        snippet: buildSkillUseSnippet(params.parsed.skillSlug, params.parsed.capability, params.parsed.input),
      };
    }
    case 'scaffold-agent': {
      const template = SCAFFOLD_TEMPLATES[params.parsed.template];
      if (!template) {
        throw new ValidationError(`Unknown scaffold template '${params.parsed.template}'. Try starter, research, or automation.`);
      }

      const writes = [];
      for (const file of template.files) {
        writes.push(executeUniversalToolCall({
          agentContext: params.agentContext,
          name: 'fs_write',
          arguments: {
            path: file.path,
            data: Buffer.from(file.content).toString('base64'),
            contentType: file.contentType,
          },
        }));
      }

      await Promise.all(writes);
      return {
        summary: `Scaffolded '${params.parsed.template}' into agent storage`,
        result: {
          template: params.parsed.template,
          files: template.files.map(file => file.path),
          summary: template.summary,
        },
        warnings: ['Review the generated files in storage before wiring them into production workflows.'],
        snippet: buildSnippetForParsedCommand(params.parsed),
      };
    }
    case 'deploy-snippet':
      return {
        summary: 'Generated the reusable Agent OS deploy helper snippet',
        result: { snippet: buildDeploySnippet() },
        snippet: buildDeploySnippet(),
      };
    case 'advanced-run': {
      const result = await executeUniversalToolCall({
        agentContext: params.agentContext,
        name: 'proc_execute',
        arguments: {
          language: params.parsed.language,
          code: params.parsed.code,
          timeout: 30000,
        },
      });
      return {
        summary: `Executed advanced ${params.parsed.language} sandbox command`,
        result,
        warnings: ['Advanced mode uses proc_execute and is intentionally more permissive than guided primitive flows.'],
        snippet: buildSnippetForParsedCommand(params.parsed),
      };
    }
  }
}

export async function executeStudioCommand(params: {
  agentContext: AgentContext;
  command: string;
  confirmToken?: string;
  advancedMode?: boolean;
}): Promise<StudioCommandResponse> {
  const advancedMode = params.advancedMode === true;
  const parsed = parseStudioCommand(params.command);
  const mutating = isMutatingStudioCommand(parsed);

  if (mutating && !params.confirmToken) {
    return previewMutatingCommand({
      agentContext: params.agentContext,
      command: params.command,
      parsed,
      advancedMode,
    });
  }

  if (mutating && params.confirmToken) {
    await consumeStudioConfirmToken({
      agentId: params.agentContext.agentId,
      command: params.command,
      advancedMode,
      token: params.confirmToken,
    });
  }

  const executed = await executeParsedCommand({
    agentContext: params.agentContext,
    parsed,
  });

  return {
    kind: parsed.type === 'help' ? 'help' : 'result',
    command: params.command,
    mutating,
    summary: executed.summary,
    result: executed.result,
    snippet: executed.snippet,
    warnings: executed.warnings,
  };
}
