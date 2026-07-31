import { consumeRuntimeSecretGrant, cleanupRuntimeSecretGrant } from '../vault/service.js';
import { redactSecretsDeep, redactSecretsInString } from '../security/secret-redaction.js';
import { ValidationError } from '../utils/errors.js';
import { IntelligenceVendor } from './service.js';

const OPENAI_RESPONSES_API = 'https://api.openai.com/v1/responses';
const OPENAI_MODELS_API = 'https://api.openai.com/v1/models';
const ANTHROPIC_MESSAGES_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODELS_API = 'https://api.anthropic.com/v1/models';
const GEMINI_API_ROOT = 'https://generativelanguage.googleapis.com/v1beta';
const CONNECTED_INTELLIGENCE_TIMEOUT_MS = 45_000;

export type ConnectedIntelligenceUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  raw: Record<string, unknown>;
};

export type ConnectedIntelligenceRequest = {
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  signal?: AbortSignal;
  onDelta?: (text: string) => void | Promise<void>;
};

export type ConnectedIntelligenceResult = {
  vendor: IntelligenceVendor;
  modelId: string;
  text: string;
  usage: ConnectedIntelligenceUsage;
  finishReason: string | null;
  streamed: boolean;
};

export type ConnectedIntelligenceModel = {
  id: string;
  label: string;
  vendor: IntelligenceVendor;
  default: boolean;
  capabilities: string[];
};

export type ConnectedIntelligenceAdapter = {
  vendor: IntelligenceVendor;
  defaultModelId: string;
  knownModels: ConnectedIntelligenceModel[];
  generate: (params: ConnectedIntelligenceRequest & { modelId: string; credential: string }) => Promise<ConnectedIntelligenceResult>;
  discoverModels: (params: { credential: string; signal?: AbortSignal }) => Promise<ConnectedIntelligenceModel[]>;
};

export class ConnectedIntelligenceError extends Error {
  constructor(
    message: string,
    public readonly code: 'cancelled' | 'invalid_request' | 'unauthorized' | 'rate_limited' | 'upstream_unavailable' | 'upstream_error',
    public readonly vendor: IntelligenceVendor,
    public readonly statusCode: number,
    public readonly retryable: boolean,
    public readonly safeDetails: Record<string, unknown> = {},
  ) {
    super(redactSecretsInString(message));
    this.name = 'ConnectedIntelligenceError';
  }
}

function cleanModelId(value: string): string {
  const modelId = value.trim();
  if (!modelId) throw new ValidationError('modelId is required');
  return modelId.replace(/^models\//, '');
}

function clampMaxTokens(value: number): number {
  return Math.max(1, Math.min(Math.floor(value || 1024), 8192));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function emptyUsage(raw: Record<string, unknown> = {}): ConnectedIntelligenceUsage {
  return { inputTokens: null, outputTokens: null, totalTokens: null, raw };
}

function normalizeUsage(raw: unknown, names: {
  input: string[];
  output: string[];
  total: string[];
}): ConnectedIntelligenceUsage {
  const record = asRecord(raw);
  const first = (keys: string[]) => {
    for (const key of keys) {
      const value = numberValue(record[key]);
      if (value !== null) return value;
    }
    return null;
  };
  return {
    inputTokens: first(names.input),
    outputTokens: first(names.output),
    totalTokens: first(names.total),
    raw: redactSecretsDeep(record) as Record<string, unknown>,
  };
}

function known(vendor: IntelligenceVendor, ids: string[], defaultModelId: string, capabilities: string[]): ConnectedIntelligenceModel[] {
  return ids.map(id => ({
    id,
    label: id,
    vendor,
    default: id === defaultModelId,
    capabilities,
  }));
}

function createBoundedSignal(signal?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONNECTED_INTELLIGENCE_TIMEOUT_MS);
  const abort = () => controller.abort(signal?.reason);

  if (signal?.aborted) controller.abort(signal.reason);
  else signal?.addEventListener('abort', abort, { once: true });

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    },
  };
}

function normalizeError(vendor: IntelligenceVendor, error: unknown): ConnectedIntelligenceError {
  if (error instanceof ConnectedIntelligenceError) return error;
  if (error instanceof Error && error.name === 'AbortError') {
    return new ConnectedIntelligenceError('Connected intelligence request was cancelled.', 'cancelled', vendor, 499, false);
  }
  return new ConnectedIntelligenceError('Connected intelligence request failed before a response was received.', 'upstream_unavailable', vendor, 503, true);
}

function errorCode(status: number): ConnectedIntelligenceError['code'] {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 408 || status === 409 || status === 425 || status === 429) return 'rate_limited';
  if (status >= 500) return 'upstream_unavailable';
  if (status >= 400) return 'invalid_request';
  return 'upstream_error';
}

async function parseErrorDetails(response: Response): Promise<Record<string, unknown>> {
  try {
    const text = await response.text();
    if (!text) return {};
    try {
      return redactSecretsDeep(JSON.parse(text)) as Record<string, unknown>;
    } catch {
      return { message: redactSecretsInString(text).slice(0, 500) };
    }
  } catch {
    return {};
  }
}

async function assertOk(vendor: IntelligenceVendor, response: Response): Promise<void> {
  if (response.ok) return;
  const details = await parseErrorDetails(response);
  throw new ConnectedIntelligenceError(
    `Connected intelligence request failed with status ${response.status}.`,
    errorCode(response.status),
    vendor,
    response.status,
    response.status === 408 || response.status === 409 || response.status === 425 || response.status === 429 || response.status >= 500,
    details,
  );
}

function parseOpenAIText(payload: unknown): string {
  const record = asRecord(payload);
  if (typeof record.output_text === 'string') return record.output_text.trim();
  const output = Array.isArray(record.output) ? record.output : [];
  return output.flatMap(item => {
    const content = Array.isArray(asRecord(item).content) ? asRecord(item).content as unknown[] : [];
    return content.map(part => {
      const text = asRecord(part).text;
      return typeof text === 'string' ? text : '';
    });
  }).join('').trim();
}

function parseAnthropicText(payload: unknown): string {
  const content = Array.isArray(asRecord(payload).content) ? asRecord(payload).content as unknown[] : [];
  return content.map(item => {
    const record = asRecord(item);
    return record.type === 'text' && typeof record.text === 'string' ? record.text : '';
  }).join('').trim();
}

function parseGeminiText(payload: unknown): string {
  const candidates = Array.isArray(asRecord(payload).candidates) ? asRecord(payload).candidates as unknown[] : [];
  return candidates.flatMap(candidate => {
    const parts = Array.isArray(asRecord(asRecord(candidate).content).parts)
      ? asRecord(asRecord(candidate).content).parts as unknown[]
      : [];
    return parts.map(part => {
      const text = asRecord(part).text;
      return typeof text === 'string' ? text : '';
    });
  }).join('').trim();
}

function openAIBody(params: ConnectedIntelligenceRequest & { modelId: string }, stream: boolean): Record<string, unknown> {
  const model = cleanModelId(params.modelId);
  const body: Record<string, unknown> = {
    model,
    instructions: params.system,
    input: params.user,
    max_output_tokens: clampMaxTokens(params.maxTokens),
    stream,
  };
  if (!model.startsWith('gpt-5')) body.temperature = params.temperature ?? 0.2;
  return body;
}

function anthropicBody(params: ConnectedIntelligenceRequest & { modelId: string }, stream: boolean): Record<string, unknown> {
  return {
    model: cleanModelId(params.modelId),
    max_tokens: clampMaxTokens(params.maxTokens),
    temperature: params.temperature ?? 0.2,
    stream,
    system: params.system,
    messages: [{ role: 'user', content: params.user }],
  };
}

function geminiBody(params: ConnectedIntelligenceRequest & { modelId: string }): Record<string, unknown> {
  return {
    systemInstruction: { parts: [{ text: params.system }] },
    contents: [{ role: 'user', parts: [{ text: params.user }] }],
    generationConfig: {
      maxOutputTokens: clampMaxTokens(params.maxTokens),
      temperature: params.temperature ?? 0.2,
    },
  };
}

async function readSse(body: ReadableStream<Uint8Array>, onData: (data: string) => Promise<void> | void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n');
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';

    for (const frame of frames) {
      const data = frame.split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trim())
        .join('\n');
      if (!data || data === '[DONE]') continue;
      await onData(data);
    }

    if (done) break;
  }
}

async function generateOpenAI(params: ConnectedIntelligenceRequest & { modelId: string; credential: string }): Promise<ConnectedIntelligenceResult> {
  const vendor: IntelligenceVendor = 'openai';
  try {
    const response = await fetch(OPENAI_RESPONSES_API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${params.credential}`,
      },
      body: JSON.stringify(openAIBody(params, Boolean(params.onDelta))),
      signal: params.signal,
    });
    await assertOk(vendor, response);

    if (params.onDelta && response.body) {
      let text = '';
      let usage = emptyUsage();
      let finishReason: string | null = null;
      await readSse(response.body, async data => {
        try {
          const payload = JSON.parse(data);
          const record = asRecord(payload);
          if (record.type === 'response.output_text.delta' && typeof record.delta === 'string') {
            text += record.delta;
            await params.onDelta?.(record.delta);
          }
          if (record.type === 'response.completed') {
            const responseRecord = asRecord(record.response);
            usage = normalizeUsage(responseRecord.usage, {
              input: ['input_tokens'],
              output: ['output_tokens'],
              total: ['total_tokens'],
            });
            finishReason = typeof responseRecord.status === 'string' ? responseRecord.status : null;
          }
        } catch {
          // Ignore malformed stream frames.
        }
      });
      return { vendor, modelId: cleanModelId(params.modelId), text: text.trim(), usage, finishReason, streamed: true };
    }

    const payload = await response.json();
    return {
      vendor,
      modelId: cleanModelId(params.modelId),
      text: parseOpenAIText(payload),
      usage: normalizeUsage(asRecord(payload).usage, {
        input: ['input_tokens'],
        output: ['output_tokens'],
        total: ['total_tokens'],
      }),
      finishReason: typeof asRecord(payload).status === 'string' ? String(asRecord(payload).status) : null,
      streamed: false,
    };
  } catch (error) {
    throw normalizeError(vendor, error);
  }
}

async function generateAnthropic(params: ConnectedIntelligenceRequest & { modelId: string; credential: string }): Promise<ConnectedIntelligenceResult> {
  const vendor: IntelligenceVendor = 'anthropic';
  try {
    const response = await fetch(ANTHROPIC_MESSAGES_API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': params.credential,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(anthropicBody(params, Boolean(params.onDelta))),
      signal: params.signal,
    });
    await assertOk(vendor, response);

    if (params.onDelta && response.body) {
      let text = '';
      let usage = emptyUsage();
      let finishReason: string | null = null;
      await readSse(response.body, async data => {
        try {
          const payload = JSON.parse(data);
          const record = asRecord(payload);
          const delta = asRecord(record.delta);
          const piece = record.type === 'content_block_delta' && delta.type === 'text_delta' && typeof delta.text === 'string'
            ? delta.text
            : '';
          if (piece) {
            text += piece;
            await params.onDelta?.(piece);
          }
          if (record.type === 'message_delta') {
            usage = normalizeUsage(record.usage, {
              input: ['input_tokens'],
              output: ['output_tokens'],
              total: ['total_tokens'],
            });
            finishReason = typeof delta.stop_reason === 'string' ? delta.stop_reason : null;
          }
        } catch {
          // Ignore malformed stream frames.
        }
      });
      return { vendor, modelId: cleanModelId(params.modelId), text: text.trim(), usage, finishReason, streamed: true };
    }

    const payload = await response.json();
    return {
      vendor,
      modelId: cleanModelId(params.modelId),
      text: parseAnthropicText(payload),
      usage: normalizeUsage(asRecord(payload).usage, {
        input: ['input_tokens'],
        output: ['output_tokens'],
        total: ['total_tokens'],
      }),
      finishReason: typeof asRecord(payload).stop_reason === 'string' ? String(asRecord(payload).stop_reason) : null,
      streamed: false,
    };
  } catch (error) {
    throw normalizeError(vendor, error);
  }
}

async function generateGemini(params: ConnectedIntelligenceRequest & { modelId: string; credential: string }): Promise<ConnectedIntelligenceResult> {
  const vendor: IntelligenceVendor = 'gemini';
  const modelId = cleanModelId(params.modelId);
  const action = params.onDelta ? 'streamGenerateContent?alt=sse' : 'generateContent';
  const queryPrefix = action.includes('?') ? '&' : '?';
  try {
    const response = await fetch(`${GEMINI_API_ROOT}/models/${encodeURIComponent(modelId)}:${action}${queryPrefix}key=${encodeURIComponent(params.credential)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(geminiBody(params)),
      signal: params.signal,
    });
    await assertOk(vendor, response);

    if (params.onDelta && response.body) {
      let text = '';
      let usage = emptyUsage();
      let finishReason: string | null = null;
      await readSse(response.body, async data => {
        try {
          const payload = JSON.parse(data);
          const piece = parseGeminiText(payload);
          if (piece) {
            text += piece;
            await params.onDelta?.(piece);
          }
          const record = asRecord(payload);
          usage = normalizeUsage(record.usageMetadata, {
            input: ['promptTokenCount'],
            output: ['candidatesTokenCount'],
            total: ['totalTokenCount'],
          });
          const candidate = Array.isArray(record.candidates) ? asRecord(record.candidates[0]) : {};
          finishReason = typeof candidate.finishReason === 'string' ? candidate.finishReason : finishReason;
        } catch {
          // Ignore malformed stream frames.
        }
      });
      return { vendor, modelId, text: text.trim(), usage, finishReason, streamed: true };
    }

    const payload = await response.json();
    const record = asRecord(payload);
    const candidate = Array.isArray(record.candidates) ? asRecord(record.candidates[0]) : {};
    return {
      vendor,
      modelId,
      text: parseGeminiText(payload),
      usage: normalizeUsage(record.usageMetadata, {
        input: ['promptTokenCount'],
        output: ['candidatesTokenCount'],
        total: ['totalTokenCount'],
      }),
      finishReason: typeof candidate.finishReason === 'string' ? candidate.finishReason : null,
      streamed: false,
    };
  } catch (error) {
    throw normalizeError(vendor, error);
  }
}

async function discoverOpenAIModels(params: { credential: string; signal?: AbortSignal }): Promise<ConnectedIntelligenceModel[]> {
  const response = await fetch(OPENAI_MODELS_API, {
    headers: { authorization: `Bearer ${params.credential}` },
    signal: params.signal,
  });
  await assertOk('openai', response);
  const payload = await response.json();
  const ids = (Array.isArray(asRecord(payload).data) ? asRecord(payload).data as unknown[] : [])
    .map(item => asRecord(item).id)
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
  return ids.map(id => ({ id, label: id, vendor: 'openai', default: id === OPENAI_ADAPTER.defaultModelId, capabilities: ['text', 'streaming'] }));
}

async function discoverAnthropicModels(params: { credential: string; signal?: AbortSignal }): Promise<ConnectedIntelligenceModel[]> {
  const response = await fetch(ANTHROPIC_MODELS_API, {
    headers: {
      'x-api-key': params.credential,
      'anthropic-version': '2023-06-01',
    },
    signal: params.signal,
  });
  await assertOk('anthropic', response);
  const payload = await response.json();
  const ids = (Array.isArray(asRecord(payload).data) ? asRecord(payload).data as unknown[] : [])
    .map(item => asRecord(item).id)
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
  return ids.map(id => ({ id, label: id, vendor: 'anthropic', default: id === ANTHROPIC_ADAPTER.defaultModelId, capabilities: ['text', 'streaming'] }));
}

async function discoverGeminiModels(params: { credential: string; signal?: AbortSignal }): Promise<ConnectedIntelligenceModel[]> {
  const response = await fetch(`${GEMINI_API_ROOT}/models?key=${encodeURIComponent(params.credential)}`, {
    signal: params.signal,
  });
  await assertOk('gemini', response);
  const payload = await response.json();
  const ids = (Array.isArray(asRecord(payload).models) ? asRecord(payload).models as unknown[] : [])
    .map(item => asRecord(item).name)
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    .map(cleanModelId);
  return ids.map(id => ({ id, label: id, vendor: 'gemini', default: id === GEMINI_ADAPTER.defaultModelId, capabilities: ['text', 'streaming'] }));
}

export const OPENAI_ADAPTER: ConnectedIntelligenceAdapter = {
  vendor: 'openai',
  defaultModelId: 'gpt-5',
  knownModels: known('openai', ['gpt-5', 'gpt-5-mini'], 'gpt-5', ['text', 'streaming']),
  generate: generateOpenAI,
  discoverModels: discoverOpenAIModels,
};

export const ANTHROPIC_ADAPTER: ConnectedIntelligenceAdapter = {
  vendor: 'anthropic',
  defaultModelId: 'claude-sonnet-4-6',
  knownModels: known('anthropic', ['claude-sonnet-4-6', 'claude-opus-4-1'], 'claude-sonnet-4-6', ['text', 'streaming']),
  generate: generateAnthropic,
  discoverModels: discoverAnthropicModels,
};

export const GEMINI_ADAPTER: ConnectedIntelligenceAdapter = {
  vendor: 'gemini',
  defaultModelId: 'gemini-2.5-pro',
  knownModels: known('gemini', ['gemini-2.5-pro', 'gemini-2.5-flash'], 'gemini-2.5-pro', ['text', 'streaming']),
  generate: generateGemini,
  discoverModels: discoverGeminiModels,
};

export const INTELLIGENCE_ADAPTERS: Record<IntelligenceVendor, ConnectedIntelligenceAdapter> = {
  openai: OPENAI_ADAPTER,
  anthropic: ANTHROPIC_ADAPTER,
  gemini: GEMINI_ADAPTER,
};

export function getIntelligenceAdapter(vendor: string): ConnectedIntelligenceAdapter {
  const adapter = INTELLIGENCE_ADAPTERS[vendor as IntelligenceVendor];
  if (!adapter) throw new ValidationError('Unsupported intelligence vendor');
  return adapter;
}

export function getKnownIntelligenceModels(vendor?: IntelligenceVendor): ConnectedIntelligenceModel[] {
  if (vendor) return [...getIntelligenceAdapter(vendor).knownModels];
  return Object.values(INTELLIGENCE_ADAPTERS).flatMap(adapter => adapter.knownModels);
}

export async function generateConnectedIntelligenceText(params: {
  ownerAgentId: string;
  vaultRuntimeGrantId: string;
  vendor: IntelligenceVendor;
  modelId: string;
  request: ConnectedIntelligenceRequest;
}): Promise<ConnectedIntelligenceResult> {
  const adapter = getIntelligenceAdapter(params.vendor);
  const consumed = await consumeRuntimeSecretGrant({
    ownerAgentId: params.ownerAgentId,
    grantId: params.vaultRuntimeGrantId,
  });
  const bounded = createBoundedSignal(params.request.signal);
  try {
    return await adapter.generate({
      ...params.request,
      signal: bounded.signal,
      modelId: params.modelId,
      credential: consumed.value,
    });
  } finally {
    bounded.cleanup();
    await cleanupRuntimeSecretGrant({
      ownerAgentId: params.ownerAgentId,
      grantId: consumed.grant.id,
    }).catch(() => {});
  }
}

export async function discoverConnectedIntelligenceModels(params: {
  ownerAgentId: string;
  vaultRuntimeGrantId: string;
  vendor: IntelligenceVendor;
  signal?: AbortSignal;
}): Promise<ConnectedIntelligenceModel[]> {
  const adapter = getIntelligenceAdapter(params.vendor);
  const consumed = await consumeRuntimeSecretGrant({
    ownerAgentId: params.ownerAgentId,
    grantId: params.vaultRuntimeGrantId,
  });
  const bounded = createBoundedSignal(params.signal);
  try {
    return await adapter.discoverModels({
      credential: consumed.value,
      signal: bounded.signal,
    });
  } finally {
    bounded.cleanup();
    await cleanupRuntimeSecretGrant({
      ownerAgentId: params.ownerAgentId,
      grantId: consumed.grant.id,
    }).catch(() => {});
  }
}
