import type { AgentOSIntent } from './intents.js';
import type { AgentContext } from '../auth/permissions.js';
import { summarizeValue } from '../ui/presenters.js';
import type { NativeResearchFetcher } from '../super-agentos/research.js';
import { runOrchestratorRuntime, runSuperAgentOSRuntime } from '../super-agentos/runtime.js';

async function runNativeReply(params: {
  message: string;
  intent: AgentOSIntent;
  workspaceName?: string | null;
  projectName?: string | null;
  executionTargetId?: string;
  recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  agentContext?: AgentContext | null;
  researchFetcher?: NativeResearchFetcher;
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
  agentContext?: AgentContext | null;
  researchFetcher?: NativeResearchFetcher;
}): Promise<string> {
  return buildNativeRecoveryReply(params);
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
  agentContext?: AgentContext | null;
  researchFetcher?: NativeResearchFetcher;
  onDelta: (text: string) => void | Promise<void>;
}): Promise<string> {
  const nativeReply = await buildNativeRecoveryReply(params);
  await params.onDelta(nativeReply);
  return nativeReply;
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
  agentContext?: AgentContext | null;
  researchFetcher?: NativeResearchFetcher;
}): Promise<string> {
  return runNativeReply(params);
}
