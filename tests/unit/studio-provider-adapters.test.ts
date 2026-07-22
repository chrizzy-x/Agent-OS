import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateWithStudioProvider, getConfiguredStudioProvider, streamWithStudioProvider } from '../../src/studio/providers.js';

const originalEnv = {
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
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_MODEL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetEnv();
  });

  it('selects configured Anthropic before OpenAI by default', () => {
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';
    process.env.OPENAI_API_KEY = 'openai-key';

    expect(getConfiguredStudioProvider()).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
    });
  });

  it('can prefer OpenAI through STUDIO_AI_PROVIDER', async () => {
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
