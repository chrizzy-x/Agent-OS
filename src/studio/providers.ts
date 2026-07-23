const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const OPENAI_RESPONSES_API = 'https://api.openai.com/v1/responses';

export type StudioProviderName = 'anthropic' | 'openai' | 'gemini';

export type StudioProviderRequest = {
  system: string;
  user: string;
  maxTokens: number;
  signal?: AbortSignal;
};

export type StudioProviderResult = {
  provider: StudioProviderName;
  model: string;
  text: string;
};

export type StudioProviderStatus = {
  configured: boolean;
  provider: StudioProviderName | null;
  model: string | null;
  label: string;
  mode: 'native' | 'external';
  message: string;
};

function preferredProvider(): StudioProviderName | null {
  if (process.env.NODE_ENV === 'production' || process.env.AGENTOS_ENABLE_DEV_PROVIDER_KEYS !== '1') return null;
  const configured = process.env.STUDIO_AI_PROVIDER?.trim().toLowerCase();
  if (configured === 'openai' || configured === 'anthropic' || configured === 'gemini') return configured;
  return null;
}

export function getConfiguredStudioProvider(): { provider: StudioProviderName; model: string } | null {
  const preferred = preferredProvider();
  if (preferred === 'openai' && process.env.OPENAI_API_KEY) {
    return { provider: 'openai', model: process.env.OPENAI_MODEL ?? 'gpt-5' };
  }
  if (preferred === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
    return { provider: 'anthropic', model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6' };
  }
  return null;
}

export function getStudioModelLabel(): string {
  const provider = getConfiguredStudioProvider();
  return provider ? `${provider.provider}:${provider.model}` : 'super-agentos:native';
}

export function getStudioProviderStatus(): StudioProviderStatus {
  const provider = getConfiguredStudioProvider();
  if (!provider) {
    return {
      configured: false,
      provider: null,
      model: null,
      label: 'Super AgentOS',
      mode: 'native',
      message: 'Super AgentOS is the native AgentOS runtime. External intelligence is optional and user-connected through Vault.',
    };
  }
  return {
    configured: true,
    provider: provider.provider,
    model: provider.model,
    label: `${provider.provider}:${provider.model}`,
    mode: 'external',
    message: 'Development external intelligence override is configured. Production users connect provider credentials through Vault.',
  };
}

function parseOpenAIText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === 'string') return record.output_text.trim();
  const output = Array.isArray(record.output) ? record.output : [];
  return output.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? (item as Record<string, unknown>).content as unknown[]
      : [];
    return content.map(part => {
      if (!part || typeof part !== 'object') return '';
      const text = (part as Record<string, unknown>).text;
      return typeof text === 'string' ? text : '';
    });
  }).join('').trim();
}

function anthropicBody(params: StudioProviderRequest, model: string, stream = false): Record<string, unknown> {
  return {
    model,
    max_tokens: params.maxTokens,
    temperature: 0.2,
    stream,
    system: params.system,
    messages: [{ role: 'user', content: params.user }],
  };
}

function openAIBody(params: StudioProviderRequest, model: string, stream = false): Record<string, unknown> {
  return {
    model,
    instructions: params.system,
    input: params.user,
    max_output_tokens: params.maxTokens,
    stream,
  };
}

async function callAnthropic(params: StudioProviderRequest, model: string): Promise<string> {
  const response = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(anthropicBody(params, model)),
    signal: params.signal,
  });
  if (!response.ok) return '';
  const payload = await response.json() as { content?: Array<{ type?: string; text?: string }> };
  return payload.content?.find(item => item.type === 'text')?.text?.trim() ?? '';
}

async function callOpenAI(params: StudioProviderRequest, model: string): Promise<string> {
  const response = await fetch(OPENAI_RESPONSES_API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ''}`,
    },
    body: JSON.stringify(openAIBody(params, model)),
    signal: params.signal,
  });
  if (!response.ok) return '';
  return parseOpenAIText(await response.json());
}

export async function generateWithStudioProvider(params: StudioProviderRequest): Promise<StudioProviderResult | null> {
  const configured = getConfiguredStudioProvider();
  if (!configured) return null;
  const text = configured.provider === 'anthropic'
    ? await callAnthropic(params, configured.model)
    : await callOpenAI(params, configured.model);
  return text ? { ...configured, text } : null;
}

async function streamAnthropic(params: StudioProviderRequest & { onDelta: (text: string) => void | Promise<void> }, model: string): Promise<string> {
  const response = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(anthropicBody(params, model, true)),
    signal: params.signal,
  });
  if (!response.ok || !response.body) return '';

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
      const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
      if (!data || data === '[DONE]') continue;
      try {
        const payload = JSON.parse(data) as { type?: string; delta?: { type?: string; text?: string } };
        const text = payload.type === 'content_block_delta' && payload.delta?.type === 'text_delta' ? payload.delta.text ?? '' : '';
        if (!text) continue;
        reply += text;
        await params.onDelta(text);
      } catch {
        // Ignore malformed provider events.
      }
    }

    if (done) break;
  }

  return reply.trim();
}

async function streamOpenAI(params: StudioProviderRequest & { onDelta: (text: string) => void | Promise<void> }, model: string): Promise<string> {
  const response = await fetch(OPENAI_RESPONSES_API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ''}`,
    },
    body: JSON.stringify(openAIBody(params, model, true)),
    signal: params.signal,
  });
  if (!response.ok || !response.body) return '';

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
      const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
      if (!data || data === '[DONE]') continue;
      try {
        const payload = JSON.parse(data) as { type?: string; delta?: string };
        const text = payload.type === 'response.output_text.delta' ? payload.delta ?? '' : '';
        if (!text) continue;
        reply += text;
        await params.onDelta(text);
      } catch {
        // Ignore malformed provider events.
      }
    }

    if (done) break;
  }

  return reply.trim();
}

export async function streamWithStudioProvider(
  params: StudioProviderRequest & { onDelta: (text: string) => void | Promise<void> },
): Promise<StudioProviderResult | null> {
  const configured = getConfiguredStudioProvider();
  if (!configured) return null;
  const text = configured.provider === 'anthropic'
    ? await streamAnthropic(params, configured.model)
    : await streamOpenAI(params, configured.model);
  return text ? { ...configured, text } : null;
}
