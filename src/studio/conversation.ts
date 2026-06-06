import type { AgentOSIntent } from './intents.js';
import { summarizeValue } from '../ui/presenters.js';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

export async function generateStudioChatReply(params: {
  message: string;
  intent: AgentOSIntent;
  workspaceName?: string | null;
  projectName?: string | null;
  sessionTitle?: string | null;
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return buildFallbackReply(params);
  }

  const contextLines = [
    params.workspaceName ? `Workspace: ${params.workspaceName}` : null,
    params.projectName ? `Project: ${params.projectName}` : null,
    params.sessionTitle ? `Session: ${params.sessionTitle}` : null,
    `Intent: ${params.intent}`,
  ].filter(Boolean).join('\n');

  try {
    const response = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-latest',
        max_tokens: 500,
        temperature: 0.2,
        system: [
          'You are AgentOS Studio, an AI operating system assistant.',
          'Respond concisely in plain language.',
          'Never emit raw JSON or transport payloads.',
          'If the request sounds actionable but needs an approval step, describe the action briefly instead of inventing success.',
        ].join(' '),
        messages: [{
          role: 'user',
          content: `${contextLines}\n\nUser request:\n${params.message}`,
        }],
      }),
    });

    if (!response.ok) return buildFallbackReply(params);
    const payload = await response.json() as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const reply = payload.content?.find(item => item.type === 'text')?.text?.trim();
    return reply || buildFallbackReply(params);
  } catch {
    return buildFallbackReply(params);
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
  if (params.intent === 'RESEARCH') {
    return 'I can research this. Ask for sources, a comparison, or a focused summary.';
  }
  if (params.intent === 'REASONING') {
    return 'I can work through this step by step. Narrow the goal if you want a tighter answer.';
  }
  const scope = [params.workspaceName, params.projectName].filter(Boolean).join(' / ');
  return scope
    ? `Working in ${scope}. ${params.message.trim()}`
    : params.message.trim();
}
