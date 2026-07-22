import type { AgentOSIntent } from './intents.js';
import { generateWithStudioProvider, streamWithStudioProvider } from './providers.js';
import { summarizeValue } from '../ui/presenters.js';

function buildConversationContext(params: {
  message: string;
  intent: AgentOSIntent;
  workspaceName?: string | null;
  projectName?: string | null;
  sessionTitle?: string | null;
}): string {
  const contextLines = [
    params.workspaceName ? `Workspace: ${params.workspaceName}` : null,
    params.projectName ? `Project: ${params.projectName}` : null,
    params.sessionTitle ? `Session: ${params.sessionTitle}` : null,
    `Intent: ${params.intent}`,
  ].filter(Boolean).join('\n');

  return `${contextLines}\n\nUser request:\n${params.message}`;
}

function buildConversationPayload(params: {
  message: string;
  intent: AgentOSIntent;
  workspaceName?: string | null;
  projectName?: string | null;
  sessionTitle?: string | null;
}): { system: string; user: string; maxTokens: number } {
  return {
    maxTokens: 1200,
    system: [
      'You are AgentOS Studio, an AI operating system assistant.',
      'Respond clearly in useful Markdown.',
      'Never emit raw JSON, transport payloads, hidden reasoning, or internal chain-of-thought.',
      'If the request sounds actionable but needs an approval step, describe the action briefly instead of inventing success.',
    ].join(' '),
    user: buildConversationContext(params),
  };
}

function sentenceCase(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

function extractOutcome(message: string): string {
  return sentenceCase(message)
    .replace(/\?+$/g, '')
    .replace(/\b(please|pls)\b/gi, '')
    .trim();
}

function looksLikeQuestion(message: string): boolean {
  return /\?$|\b(what|why|how|when|where|who|which|can you|should i|is it|are you)\b/i.test(message);
}

function buildLocalAnswer(params: {
  message: string;
  intent: AgentOSIntent;
  workspaceName?: string | null;
  projectName?: string | null;
}): string {
  const outcome = extractOutcome(params.message);
  const scope = [params.workspaceName, params.projectName].filter(Boolean).join(' / ');
  const scopeLine = scope ? `Scope: ${scope}` : 'Scope: current AgentOS workspace';

  if (params.intent === 'RESEARCH') {
    return [
      `I can prepare the research path for: ${outcome}.`,
      '',
      scopeLine,
      '',
      'Suggested execution:',
      '1. Define the exact question and success criteria.',
      '2. Gather sources from approved web, file, project, app, or MCP context.',
      '3. Compare findings, conflicts, and confidence.',
      '4. Return a concise report with citations when source access is available.',
      '',
      'Provider status: live model execution is not configured in this environment, so I am giving the execution plan instead of pretending the research was completed.',
    ].join('\n');
  }

  if (params.intent === 'REASONING' || looksLikeQuestion(params.message)) {
    return [
      `Here is the useful starting answer for: ${outcome}.`,
      '',
      scopeLine,
      '',
      'Best next steps:',
      '1. Clarify the desired final output.',
      '2. Identify the available workspace context and tools.',
      '3. Separate facts, assumptions, and actions.',
      '4. Execute only the actions that have real connected capability support.',
      '',
      'Provider status: live model execution is not configured in this environment, so this is a local structured response rather than a full AI-generated answer.',
    ].join('\n');
  }

  return [
    `I can help with: ${outcome}.`,
    '',
    scopeLine,
    '',
    'Execution approach:',
    '1. Understand the outcome.',
    '2. Plan the work.',
    '3. Use connected apps, skills, workflows, subagents, MCP tools, Library assets, memory, and Vault permissions when available.',
    '4. Deliver the result or show the exact missing setup.',
    '',
    'Provider status: live model execution is not configured in this environment, so I will not claim that external work has run.',
  ].join('\n');
}

export async function generateStudioChatReply(params: {
  message: string;
  intent: AgentOSIntent;
  workspaceName?: string | null;
  projectName?: string | null;
  sessionTitle?: string | null;
}): Promise<string> {
  const payload = buildConversationPayload(params);
  try {
    const result = await generateWithStudioProvider(payload);
    return result?.text || buildFallbackReply(params);
  } catch {
    return buildFallbackReply(params);
  }
}

export async function streamStudioChatReply(params: {
  message: string;
  intent: AgentOSIntent;
  workspaceName?: string | null;
  projectName?: string | null;
  sessionTitle?: string | null;
  signal?: AbortSignal;
  onDelta: (text: string) => void | Promise<void>;
}): Promise<string> {
  const payload = buildConversationPayload(params);
  try {
    const result = await streamWithStudioProvider({
      ...payload,
      signal: params.signal,
      onDelta: params.onDelta,
    });
    if (result?.text) return result.text;
  } catch {
    // Fall through to local fallback.
  }

  {
    const fallback = buildFallbackReply(params);
    await params.onDelta(fallback);
    return fallback;
  }
}

export function formatExecutionReply(summary: string, result: unknown): string {
  const detail = summarizeValue(result, 220);
  if (!detail || detail === 'No details') return summary;
  return `${summary}\n${detail}`;
}

function buildFallbackReply(params: {
  message: string;
  intent: AgentOSIntent;
  workspaceName?: string | null;
  projectName?: string | null;
}): string {
  return buildLocalAnswer(params);
}
