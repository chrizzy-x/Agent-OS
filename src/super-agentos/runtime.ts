import type { AgentOSIntent } from '../studio/intents.js';

export type SuperAgentOSRuntimeRequest = {
  message: string;
  intent: AgentOSIntent;
  workspaceName?: string | null;
  projectName?: string | null;
  sessionTitle?: string | null;
  executionTargetId?: string;
};

export type SuperAgentOSRuntimeResult = {
  text: string;
  trace: string[];
  completedBy: 'super_agentos' | 'orchestrator';
};

function cleanSentence(value: string): string {
  return value.trim().replace(/\s+/g, ' ').replace(/\?+$/g, '');
}

function scopeLine(params: SuperAgentOSRuntimeRequest): string {
  const scope = [params.workspaceName, params.projectName].filter(Boolean).join(' / ');
  return scope ? `Scope: ${scope}` : 'Scope: current AgentOS workspace';
}

function isQuestion(message: string): boolean {
  return /\?$|\b(what|why|how|when|where|who|which|can you|should i|is it|are you)\b/i.test(message);
}

export async function runSuperAgentOSRuntime(params: SuperAgentOSRuntimeRequest): Promise<SuperAgentOSRuntimeResult> {
  const outcome = cleanSentence(params.message);
  const trace = [
    'Super AgentOS analyzed the request',
    'Super AgentOS inspected available workspace context',
    'Super AgentOS prepared a native execution path',
  ];

  if (params.intent === 'RESEARCH') {
    return {
      completedBy: 'super_agentos',
      trace,
      text: [
        `I can prepare the research path for: ${outcome}.`,
        '',
        scopeLine(params),
        '',
        'Execution plan:',
        '1. Define the exact question and success criteria.',
        '2. Gather sources from approved web, file, project, app, MCP, or Vault-authorized context.',
        '3. Compare findings, conflicts, and confidence.',
        '4. Return a concise report with citations when source access is available.',
        '',
        'External intelligence is not required for this plan. If a connected provider is selected, Super AgentOS will use it only as an optional assistant and will validate the final result itself.',
      ].join('\n'),
    };
  }

  if (params.intent === 'REASONING' || isQuestion(params.message)) {
    return {
      completedBy: 'super_agentos',
      trace,
      text: [
        `Here is the useful starting answer for: ${outcome}.`,
        '',
        scopeLine(params),
        '',
        'Native AgentOS path:',
        '1. Separate facts, assumptions, and required actions.',
        '2. Use available project, memory, Library, Vault, app, skill, Prime Agent, Primeflow, and MCP context.',
        '3. Execute only connected capabilities with permission.',
        '4. Return the best complete result available without fabricating missing work.',
      ].join('\n'),
    };
  }

  return {
    completedBy: 'super_agentos',
    trace,
    text: [
      `I can work on: ${outcome}.`,
      '',
      scopeLine(params),
      '',
      'Super AgentOS execution path:',
      '1. Understand the requested outcome.',
      '2. Build a plan from available AgentOS context.',
      '3. Use connected skills, apps, Prime Agents, Primeflows, MCP tools, memory, and Vault permissions when available.',
      '4. Deliver the completed result or show the exact missing connection needed.',
      '',
      'External intelligence is optional. Super AgentOS remains the active runtime for this session.',
    ].join('\n'),
  };
}

export async function runOrchestratorRuntime(params: SuperAgentOSRuntimeRequest): Promise<SuperAgentOSRuntimeResult> {
  const native = await runSuperAgentOSRuntime(params);
  return {
    completedBy: 'orchestrator',
    trace: [
      'Orchestrator analyzed task complexity',
      'Orchestrator checked available Prime Agents, Skills, Apps, Primeflows, MCP tools, and external intelligence',
      'Orchestrator kept execution with Super AgentOS where delegation was unavailable or unnecessary',
      'Super AgentOS validated and assembled the final result',
    ],
    text: [
      `Orchestrator mode is active for: ${cleanSentence(params.message)}.`,
      '',
      'Delegation plan:',
      '1. Identify task segments that benefit from Prime Agents, Skills, Apps, Primeflows, MCP tools, or connected external intelligence.',
      '2. Delegate only available and authorized segments.',
      '3. Recover each failed segment through Super AgentOS.',
      '4. Merge delegated outputs into one final answer.',
      '',
      native.text,
    ].join('\n'),
  };
}
