export const AGENT_OS_INTENTS = [
  'NORMAL_CHAT',
  'REASONING',
  'RESEARCH',
  'WORKFLOW_DESIGN',
  'WORKFLOW_EXECUTION',
  'APP_BUILD',
  'APP_PUBLISH',
  'SKILL_BUILD',
  'SKILL_PUBLISH',
  'MCP_TASK',
  'FFP_TASK',
  'VAULT_TASK',
  'SDK_TASK',
  'PROJECT_TASK',
  'AGENT_TASK',
  'EXECUTION_TASK',
  'UNKNOWN',
] as const;

export type AgentOSIntent = (typeof AGENT_OS_INTENTS)[number];

function hasKeyword(message: string, keywords: string[]): boolean {
  return keywords.some(keyword => message.includes(keyword));
}

export function detectIntentHeuristically(input: string): AgentOSIntent {
  const message = input.trim().toLowerCase();
  if (!message) return 'UNKNOWN';

  if (hasKeyword(message, ['vault', 'secret', 'rotate secret', 'assign secret', 'revoke secret'])) return 'VAULT_TASK';
  if (hasKeyword(message, [' ffp', 'ffp ', 'primitive history', 'route history', 'fallback history', 'consensus route'])) return 'FFP_TASK';
  if (hasKeyword(message, [' mcp', 'mcp ', 'connector', 'tool discovery', 'external tool', 'provider registry'])) return 'MCP_TASK';
  if (hasKeyword(message, ['sdk', 'kernel', 'heartbeat', 'manifest', 'developer console'])) return 'SDK_TASK';
  if (/\b(project|rename project|new project|create project|archive project)\b/.test(message)) return 'PROJECT_TASK';
  if (/\b(agent|subagent|assistant agent)\b/.test(message)) return 'AGENT_TASK';
  if (/\b(pause|resume|retry|cancel|rollback|inspect)\s+(execution|task|run)\b/.test(message)) return 'EXECUTION_TASK';
  if (/\b(panic|stop all|cancel all active executions|stop active executions)\b/.test(message)) return 'EXECUTION_TASK';
  if (/\b(primeflow|workflow|automation|schedule|cron)\b/.test(message)) {
    if (/^\s*(run|execute|start|trigger)\s+(?:a\s+|the\s+)?(?:primeflow|workflow|automation|schedule|cron)\b/.test(message)) return 'WORKFLOW_EXECUTION';
    return 'WORKFLOW_DESIGN';
  }
  if (/\b(publish|submit|release)\b.*\bapp\b|\bapp\b.*\b(publish|release)\b/.test(message)) return 'APP_PUBLISH';
  if (/\b(build|create|make|scaffold)\b.*\bapp\b|\bapp\b.*\b(build|create|scaffold)\b/.test(message)) return 'APP_BUILD';
  if (/\b(publish|submit|release)\b.*\bskill\b|\bskill\b.*\b(publish|release)\b/.test(message)) return 'SKILL_PUBLISH';
  if (/\b(build|create|make)\b.*\bskill\b|\bskill\b.*\b(build|create)\b/.test(message)) return 'SKILL_BUILD';
  if (/\b(reason|reasoning|step by step|analyze carefully|think through)\b/.test(message)) return 'REASONING';
  if (/\b(research|investigate|find sources|look up|survey)\b/.test(message)) return 'RESEARCH';
  if (/\b(run|execute|call|invoke|install|connect|open|list)\b/.test(message)) return 'EXECUTION_TASK';
  return 'NORMAL_CHAT';
}

export async function detectAgentOSIntent(input: string): Promise<AgentOSIntent> {
  const heuristic = detectIntentHeuristically(input);
  return heuristic === 'UNKNOWN' ? 'NORMAL_CHAT' : heuristic;
}

export function humanStatusForIntent(intent: AgentOSIntent): string {
  switch (intent) {
    case 'REASONING':
      return 'Thinking...';
    case 'RESEARCH':
      return 'Researching...';
    case 'WORKFLOW_DESIGN':
      return 'Designing workflow...';
    case 'WORKFLOW_EXECUTION':
      return 'Executing workflow...';
    case 'APP_BUILD':
      return 'Building app...';
    case 'APP_PUBLISH':
      return 'Publishing app...';
    case 'SKILL_BUILD':
      return 'Building skill...';
    case 'SKILL_PUBLISH':
      return 'Publishing skill...';
    case 'MCP_TASK':
      return 'Connecting tools...';
    case 'FFP_TASK':
      return 'Checking route history...';
    case 'VAULT_TASK':
      return 'Checking vault access...';
    case 'SDK_TASK':
      return 'Checking SDK...';
    case 'PROJECT_TASK':
      return 'Updating project...';
    case 'AGENT_TASK':
      return 'Working with agents...';
    case 'EXECUTION_TASK':
      return 'Executing...';
    case 'UNKNOWN':
      return 'Analyzing...';
    default:
      return 'Thinking...';
  }
}

export function translateMessageToStudioCommand(input: string): string | null {
  const message = input.trim();
  const lower = message.toLowerCase();

  if (lower === 'help') return 'help';
  if (/\b(agent status|workspace status|show status)\b/.test(lower)) return 'agent status';
  if (/\b(list tools|show tools|available tools)\b/.test(lower)) return 'tools list';
  if (/\b(list mcp|show connectors|show mcp)\b/.test(lower)) return 'mcp list';
  if (/^(?:tool run|mcp call|skills use)\s/.test(lower)) return message;

  const installSkillMatch = lower.match(/\binstall skill\s+([a-z0-9._-]+)/);
  if (installSkillMatch) return `skills install ${installSkillMatch[1]}`;

  const searchSkillMatch = message.match(/\b(?:find|search)\s+skills?\s+(.+)/i);
  if (searchSkillMatch) return `skills search ${searchSkillMatch[1].trim()}`;

  const scaffoldAgentMatch = lower.match(/\bscaffold agent\s+(starter|research|automation)\b/);
  if (scaffoldAgentMatch) return `scaffold agent ${scaffoldAgentMatch[1]}`;

  return null;
}

export function isWorkflowIntent(intent: AgentOSIntent): boolean {
  return intent === 'WORKFLOW_DESIGN' || intent === 'WORKFLOW_EXECUTION';
}
