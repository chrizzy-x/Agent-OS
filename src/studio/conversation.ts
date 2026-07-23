import type { AgentOSIntent } from './intents.js';
import { generateWithStudioProvider, streamWithStudioProvider } from './providers.js';
import { summarizeValue } from '../ui/presenters.js';
import { runOrchestratorRuntime, runSuperAgentOSRuntime } from '../super-agentos/runtime.js';

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

async function runNativeReply(params: {
  message: string;
  intent: AgentOSIntent;
  workspaceName?: string | null;
  projectName?: string | null;
  executionTargetId?: string;
  recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<string> {
  const result = params.executionTargetId === 'orchestrator'
    ? await runOrchestratorRuntime(params)
    : await runSuperAgentOSRuntime(params);
  return result.text;
}

export async function generateStudioChatReply(params: {
  message: string;
  intent: AgentOSIntent;
  workspaceName?: string | null;
  projectName?: string | null;
  sessionTitle?: string | null;
  executionTargetId?: string;
  recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<string> {
  if (!params.executionTargetId?.startsWith('external_provider:')) {
    return buildNativeRecoveryReply(params);
  }

  const payload = buildConversationPayload(params);
  try {
    const result = await generateWithStudioProvider(payload);
    return result?.text || await buildNativeRecoveryReply(params);
  } catch {
    return buildNativeRecoveryReply(params);
  }
}

export async function streamStudioChatReply(params: {
  message: string;
  intent: AgentOSIntent;
  workspaceName?: string | null;
  projectName?: string | null;
  sessionTitle?: string | null;
  executionTargetId?: string;
  signal?: AbortSignal;
  recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  onDelta: (text: string) => void | Promise<void>;
}): Promise<string> {
  if (!params.executionTargetId?.startsWith('external_provider:')) {
    const nativeReply = await buildNativeRecoveryReply(params);
    await params.onDelta(nativeReply);
    return nativeReply;
  }

  const payload = buildConversationPayload(params);
  try {
    const result = await streamWithStudioProvider({
      ...payload,
      signal: params.signal,
      onDelta: params.onDelta,
    });
    if (result?.text) return result.text;
  } catch {
    // External intelligence failed or is unavailable; Super AgentOS remains in control.
  }

  {
    const nativeReply = await buildNativeRecoveryReply(params);
    await params.onDelta(nativeReply);
    return nativeReply;
  }
}

export function formatExecutionReply(summary: string, result: unknown): string {
  const detail = summarizeValue(result, 220);
  if (!detail || detail === 'No details') return summary;
  return `${summary}\n${detail}`;
}

async function buildNativeRecoveryReply(params: {
  message: string;
  intent: AgentOSIntent;
  workspaceName?: string | null;
  projectName?: string | null;
  executionTargetId?: string;
  recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<string> {
  return runNativeReply(params);
}
