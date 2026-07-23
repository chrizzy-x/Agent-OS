import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateWithStudioProvider, getConfiguredStudioProvider, getStudioProviderStatus, streamWithStudioProvider } from '../../src/studio/providers.js';

const originalEnv = {
  AGENTOS_ENABLE_DEV_PROVIDER_KEYS: process.env.AGENTOS_ENABLE_DEV_PROVIDER_KEYS,
  NODE_ENV: process.env.NODE_ENV,
  STUDIO_AI_PROVIDER: process.env.STUDIO_AI_PROVIDER,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
};

function resetEnv() {
  for (const key of Object.keys(originalEnv) as Array<keyof typeof originalEnv>) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function streamFromFrames(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
}

describe('Studio provider adapters', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.STUDIO_AI_PROVIDER;
    delete process.env.AGENTOS_ENABLE_DEV_PROVIDER_KEYS;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_MODEL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetEnv();
  });

  it('keeps Super AgentOS native as the default even when provider env keys exist', () => {
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';
    process.env.OPENAI_API_KEY = 'openai-key';

    expect(getConfiguredStudioProvider()).toBeNull();
  });

  it('reports native Super AgentOS without exposing provider secrets', () => {
    expect(getStudioProviderStatus()).toEqual({
      configured: false,
      provider: null,
      model: null,
      label: 'Super AgentOS',
      mode: 'native',
      message: 'Super AgentOS is the native AgentOS runtime. External intelligence is optional and user-connected through Vault.',
    });
  });

  it('can use OpenAI only through an explicit development override', async () => {
    process.env.AGENTOS_ENABLE_DEV_PROVIDER_KEYS = '1';
    process.env.STUDIO_AI_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'openai-key';
    process.env.OPENAI_MODEL = 'gpt-test';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      output_text: 'OpenAI response',
    }), { status: 200 }));

    const result = await generateWithStudioProvider({
      system: 'system',
      user: 'user',
      maxTokens: 120,
    });

    expect(result).toEqual({ provider: 'openai', model: 'gpt-test', text: 'OpenAI response' });
    expect(fetchMock).toHaveBeenCalledWith('https://api.openai.com/v1/responses', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ authorization: 'Bearer openai-key' }),
    }));
  });

  it('parses OpenAI response streaming deltas', async () => {
    process.env.AGENTOS_ENABLE_DEV_PROVIDER_KEYS = '1';
    process.env.STUDIO_AI_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'openai-key';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(streamFromFrames([
      'data: {"type":"response.output_text.delta","delta":"Hel"}\n\n',
      'data: {"type":"response.output_text.delta","delta":"lo"}\n\n',
    ]), { status: 200 }));
    const chunks: string[] = [];

    const result = await streamWithStudioProvider({
      system: 'system',
      user: 'user',
      maxTokens: 120,
      onDelta: text => chunks.push(text),
    });

    expect(result).toEqual({ provider: 'openai', model: 'gpt-5', text: 'Hello' });
    expect(chunks).toEqual(['Hel', 'lo']);
  });
});
