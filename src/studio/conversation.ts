import type { AgentOSIntent } from './intents.js';
import { summarizeValue } from '../ui/presenters.js';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

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

function buildConversationRequest(params: {
  message: string;
  intent: AgentOSIntent;
  workspaceName?: string | null;
  projectName?: string | null;
  sessionTitle?: string | null;
  stream?: boolean;
}): Record<string, unknown> {
  return {
    model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
    max_tokens: 1200,
    temperature: 0.2,
    stream: params.stream === true,
    system: [
      'You are AgentOS Studio, an AI operating system assistant.',
      'Respond clearly in useful Markdown.',
      'Never emit raw JSON, transport payloads, hidden reasoning, or internal chain-of-thought.',
      'If the request sounds actionable but needs an approval step, describe the action briefly instead of inventing success.',
    ].join(' '),
    messages: [{
      role: 'user',
      content: buildConversationContext(params),
    }],
  };
}

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

  try {
    const response = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(buildConversationRequest(params)),
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

export async function streamStudioChatReply(params: {
  message: string;
  intent: AgentOSIntent;
  workspaceName?: string | null;
  projectName?: string | null;
  sessionTitle?: string | null;
  signal?: AbortSignal;
  onDelta: (text: string) => void | Promise<void>;
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const fallback = buildFallbackReply(params);
    await params.onDelta(fallback);
    return fallback;
  }

  const response = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(buildConversationRequest({ ...params, stream: true })),
    signal: params.signal,
  });

  if (!response.ok || !response.body) {
    const fallback = buildFallbackReply(params);
    await params.onDelta(fallback);
    return fallback;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let reply = '';

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n');
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';

    for (const frame of frames) {
      const data = frame
        .split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trim())
        .join('\n');
      if (!data || data === '[DONE]') continue;

      try {
        const payload = JSON.parse(data) as {
          type?: string;
          delta?: { type?: string; text?: string };
        };
        const text = payload.type === 'content_block_delta' && payload.delta?.type === 'text_delta'
          ? payload.delta.text ?? ''
          : '';
        if (!text) continue;
        reply += text;
        await params.onDelta(text);
      } catch {
        // Ignore malformed provider events.
      }
    }

    if (done) break;
  }

  if (reply.trim()) return reply;
  const fallback = buildFallbackReply(params);
  await params.onDelta(fallback);
  return fallback;
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
