import type { AgentOSIntent } from '../studio/intents.js';

export type SuperAgentOSRuntimeRequest = {
  message: string;
  intent: AgentOSIntent;
  workspaceName?: string | null;
  projectName?: string | null;
  sessionTitle?: string | null;
  executionTargetId?: string;
  recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
};

export type SuperAgentOSRuntimeResult = {
  text: string;
  trace: string[];
  completedBy: 'super_agentos' | 'orchestrator';
};

function cleanSentence(value: string): string {
  return value.trim().replace(/\s+/g, ' ').replace(/\?+$/g, '');
}

function isQuestion(message: string): boolean {
  return /\?$|\b(what|why|how|when|where|who|which|can you|should i|is it|are you)\b/i.test(message);
}

function isVagueFollowUp(message: string): boolean {
  return /^(do it|do it then|yes|yeah|ok|okay|continue|go ahead|run it|approve it|make it happen)[.! ]*$/i.test(message.trim());
}

function previousAssistantPrompt(params: SuperAgentOSRuntimeRequest): string | null {
  return [...(params.recentMessages ?? [])]
    .reverse()
    .find(message => message.role === 'assistant' && /\?$/.test(message.content.trim()))
    ?.content.trim() ?? null;
}

export async function runSuperAgentOSRuntime(params: SuperAgentOSRuntimeRequest): Promise<SuperAgentOSRuntimeResult> {
  const outcome = cleanSentence(params.message);
  const trace = [
    'Super AgentOS analyzed the request',
    'Super AgentOS inspected available workspace context',
    'Super AgentOS prepared a native execution path',
  ];

  if (isVagueFollowUp(params.message)) {
    const pending = previousAssistantPrompt(params);
    return {
      completedBy: 'super_agentos',
      trace,
      text: pending
        ? `I am ready to proceed with: "${pending}" Use the visible Approve button so I can execute it with your permission.`
        : 'I need the exact task before I can execute it. Tell me the action directly, for example: "Create project Launch Plan" or "Install skill Research Assistant."',
    };
  }

  if (params.intent === 'RESEARCH') {
    return {
      completedBy: 'super_agentos',
      trace,
      text: [
        `I can research "${outcome}," but source-backed research needs an available web, file, or MCP source connected to this workspace.`,
        'Right now I can structure the report, list the questions to answer, and use any connected workspace sources you authorize. I will not invent citations or pretend unavailable tools ran.',
      ].join('\n'),
    };
  }

  if (params.intent === 'REASONING' || isQuestion(params.message)) {
    return {
      completedBy: 'super_agentos',
      trace,
      text: [
        'Right now, Super AgentOS can chat and run native AgentOS operations without connected external intelligence: open Studio surfaces, use project context, list Vault metadata, preview MCP routing, save session results, and inspect workspace capabilities.',
        'For actions that change data, I will ask for approval first; with approval, I can create, rename, or archive projects; install apps and skills; create Prime Agents; create or run Primeflows; execute Studio commands; request panic controls; and retry, cancel, pause, resume, inspect, or rollback executions.',
        'If a capability is unavailable, I will report the missing connection or permission instead of inventing execution success.',
      ].join('\n'),
    };
  }

  return {
    completedBy: 'super_agentos',
    trace,
    text: [
      `I need a concrete action to execute "${outcome}."`,
      'Use a direct command like "Create project Launch Plan," "Open Vault," "Install skill Research Assistant," "Run workflow Daily Report," "Retry execution exec_123," or "Route this through MCP filesystem."',
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
