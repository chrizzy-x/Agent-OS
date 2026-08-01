import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from '../../src/utils/errors.js';

const adapterMocks = vi.hoisted(() => ({
  consumeRuntimeSecretGrant: vi.fn(),
  cleanupRuntimeSecretGrant: vi.fn(),
}));

vi.mock('../../src/vault/service.js', () => ({
  consumeRuntimeSecretGrant: adapterMocks.consumeRuntimeSecretGrant,
  cleanupRuntimeSecretGrant: adapterMocks.cleanupRuntimeSecretGrant,
}));

import {
  ConnectedIntelligenceError,
  discoverConnectedIntelligenceModels,
  generateConnectedIntelligenceText,
  getIntelligenceAdapter,
  getKnownIntelligenceModels,
} from '../../src/intelligence/adapters.js';

function grant(value = 'vault-owned-secret') {
  return {
    name: 'OPENAI_KEY',
    value,
    grant: {
      id: 'grant-1',
      secretId: 'secret-1',
      vaultId: 'vault-1',
      workspaceId: 'workspace-1',
      ownerAgentId: 'agent-1',
      name: 'OPENAI_KEY',
      subjectType: 'session',
      subjectId: 'session-1',
      metadata: {},
      status: 'consumed',
      expiresAt: '2026-07-24T00:00:00.000Z',
      consumedAt: '2026-07-24T00:00:00.000Z',
      cleanedUpAt: null,
      createdAt: '2026-07-24T00:00:00.000Z',
    },
  };
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

describe('connected intelligence adapters', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    adapterMocks.consumeRuntimeSecretGrant.mockResolvedValue(grant());
    adapterMocks.cleanupRuntimeSecretGrant.mockResolvedValue({ id: 'grant-1', status: 'cleaned' });
  });

  it('exposes an exact adapter registry and static model catalogue', () => {
    expect(getIntelligenceAdapter('openai').defaultModelId).toBe('gpt-5');
    expect(getIntelligenceAdapter('anthropic').defaultModelId).toBe('claude-sonnet-4-6');
    expect(getIntelligenceAdapter('gemini').defaultModelId).toBe('gemini-2.5-pro');
    expect(getKnownIntelligenceModels().map(model => model.id)).toContain('gpt-5');
    expect(() => getIntelligenceAdapter('unknown')).toThrow(ValidationError);
  });

  it('generates through OpenAI using only a consumed Vault runtime grant', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      output_text: 'OpenAI response',
      usage: { input_tokens: 7, output_tokens: 3, total_tokens: 10 },
      status: 'completed',
    }), { status: 200 }));

    const result = await generateConnectedIntelligenceText({
      ownerAgentId: 'agent-1',
      vaultRuntimeGrantId: 'grant-1',
      vendor: 'openai',
      modelId: 'gpt-5',
      request: {
        system: 'system',
        user: 'user',
        maxTokens: 120,
      },
    });

    expect(adapterMocks.consumeRuntimeSecretGrant).toHaveBeenCalledWith({
      ownerAgentId: 'agent-1',
      grantId: 'grant-1',
    });
    expect(fetchMock).toHaveBeenCalledWith('https://api.openai.com/v1/responses', expect.objectContaining({
      headers: expect.objectContaining({ authorization: 'Bearer vault-owned-secret' }),
      signal: expect.any(AbortSignal),
    }));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      reasoning: { effort: 'minimal' },
      store: false,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).not.toHaveProperty('temperature');
    expect(adapterMocks.cleanupRuntimeSecretGrant).toHaveBeenCalledWith({
      ownerAgentId: 'agent-1',
      grantId: 'grant-1',
    });
    expect(result).toMatchObject({
      vendor: 'openai',
      modelId: 'gpt-5',
      text: 'OpenAI response',
      usage: { inputTokens: 7, outputTokens: 3, totalTokens: 10 },
      streamed: false,
    });
    expect(JSON.stringify(result)).not.toContain('vault-owned-secret');
  });

  it('streams Anthropic deltas and normalizes usage', async () => {
    adapterMocks.consumeRuntimeSecretGrant.mockResolvedValue(grant('anthropic-secret'));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(streamFromFrames([
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}\n\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"lo"}}\n\n',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":4,"output_tokens":2}}\n\n',
    ]), { status: 200 }));
    const chunks: string[] = [];

    const result = await generateConnectedIntelligenceText({
      ownerAgentId: 'agent-1',
      vaultRuntimeGrantId: 'grant-1',
      vendor: 'anthropic',
      modelId: 'claude-sonnet-4-6',
      request: {
        system: 'system',
        user: 'user',
        maxTokens: 120,
        onDelta: text => chunks.push(text),
      },
    });

    expect(chunks).toEqual(['Hel', 'lo']);
    expect(result).toMatchObject({
      vendor: 'anthropic',
      text: 'Hello',
      finishReason: 'end_turn',
      usage: { inputTokens: 4, outputTokens: 2 },
      streamed: true,
    });
  });

  it('normalizes cancellation without falling back to another vendor', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));

    await expect(generateConnectedIntelligenceText({
      ownerAgentId: 'agent-1',
      vaultRuntimeGrantId: 'grant-1',
      vendor: 'gemini',
      modelId: 'gemini-2.5-pro',
      request: {
        system: 'system',
        user: 'user',
        maxTokens: 120,
      },
    })).rejects.toMatchObject({
      code: 'cancelled',
      vendor: 'gemini',
      retryable: false,
    });
  });

  it('propagates caller cancellation through the bounded request signal', async () => {
    const controller = new AbortController();
    let capturedSignal: AbortSignal | null = null;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      capturedSignal = init?.signal instanceof AbortSignal ? init.signal : null;
      controller.abort();
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    });

    await expect(generateConnectedIntelligenceText({
      ownerAgentId: 'agent-1',
      vaultRuntimeGrantId: 'grant-1',
      vendor: 'openai',
      modelId: 'gpt-5',
      request: {
        system: 'system',
        user: 'user',
        maxTokens: 120,
        signal: controller.signal,
      },
    })).rejects.toMatchObject({
      code: 'cancelled',
      vendor: 'openai',
      retryable: false,
    });
    expect(capturedSignal?.aborted).toBe(true);
    expect(adapterMocks.cleanupRuntimeSecretGrant).toHaveBeenCalledWith({
      ownerAgentId: 'agent-1',
      grantId: 'grant-1',
    });
  });

  it('generates through Gemini with the correct non-stream endpoint and normalized usage', async () => {
    adapterMocks.consumeRuntimeSecretGrant.mockResolvedValue(grant('gemini-secret'));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      candidates: [{
        content: { parts: [{ text: 'Gemini response' }] },
        finishReason: 'STOP',
      }],
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 4, totalTokenCount: 9 },
    }), { status: 200 }));

    const result = await generateConnectedIntelligenceText({
      ownerAgentId: 'agent-1',
      vaultRuntimeGrantId: 'grant-1',
      vendor: 'gemini',
      modelId: 'gemini-2.5-pro',
      request: {
        system: 'system',
        user: 'user',
        maxTokens: 120,
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=gemini-secret',
      expect.any(Object),
    );
    expect(result).toMatchObject({
      vendor: 'gemini',
      text: 'Gemini response',
      finishReason: 'STOP',
      usage: { inputTokens: 5, outputTokens: 4, totalTokens: 9 },
      streamed: false,
    });
  });

  it('redacts upstream error details', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      error: { message: 'api_key=sk-secretsecretsecret rejected' },
    }), { status: 401 }));

    await expect(generateConnectedIntelligenceText({
      ownerAgentId: 'agent-1',
      vaultRuntimeGrantId: 'grant-1',
      vendor: 'openai',
      modelId: 'gpt-5',
      request: {
        system: 'system',
        user: 'user',
        maxTokens: 120,
      },
    })).rejects.toSatisfy(error => {
      expect(error).toBeInstanceOf(ConnectedIntelligenceError);
      expect(JSON.stringify((error as ConnectedIntelligenceError).safeDetails)).not.toContain('sk-secret');
      expect((error as ConnectedIntelligenceError).code).toBe('unauthorized');
      return true;
    });
  });

  it('discovers Gemini models through a Vault-backed runtime grant', async () => {
    adapterMocks.consumeRuntimeSecretGrant.mockResolvedValue(grant('gemini-secret'));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      models: [
        { name: 'models/gemini-2.5-pro' },
        { name: 'models/gemini-2.5-flash' },
      ],
    }), { status: 200 }));

    const models = await discoverConnectedIntelligenceModels({
      ownerAgentId: 'agent-1',
      vaultRuntimeGrantId: 'grant-1',
      vendor: 'gemini',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models?key=gemini-secret',
      expect.any(Object),
    );
    expect(models.map(model => model.id)).toEqual(['gemini-2.5-pro', 'gemini-2.5-flash']);
    expect(JSON.stringify(models)).not.toContain('gemini-secret');
    expect(adapterMocks.cleanupRuntimeSecretGrant).toHaveBeenCalledWith({
      ownerAgentId: 'agent-1',
      grantId: 'grant-1',
    });
  });
});
