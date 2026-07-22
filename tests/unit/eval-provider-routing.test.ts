import { beforeEach, describe, expect, it, vi } from 'vitest';

const providerMocks = vi.hoisted(() => ({
  generateWithStudioProvider: vi.fn(),
  getStudioProviderStatus: vi.fn(),
}));

vi.mock('../../src/storage/supabase.js', () => ({
  getSupabaseAdmin: vi.fn(() => {
    throw new Error('Supabase is not configured in this unit test.');
  }),
}));

vi.mock('../../src/studio/providers.js', () => ({
  generateWithStudioProvider: providerMocks.generateWithStudioProvider,
  getStudioProviderStatus: providerMocks.getStudioProviderStatus,
}));

describe('eval LLM judging provider routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    providerMocks.getStudioProviderStatus.mockReturnValue({
      configured: false,
      provider: null,
      model: null,
      label: 'Local fallback',
      mode: 'local_fallback',
      message: 'Live model execution is not configured.',
    });
  });

  it('uses deterministic scoring when no Studio provider is configured', async () => {
    const { judgeWithLlm } = await import('../../src/eval/service.js');

    await expect(judgeWithLlm({ answer: 'yes' }, { answer: 'yes' })).resolves.toEqual({
      score: 0.8,
      reasoning: 'Deterministic fallback judge used because live Studio provider execution is not configured.',
    });

    expect(providerMocks.generateWithStudioProvider).not.toHaveBeenCalled();
  });

  it('routes live judging through the Studio provider adapter', async () => {
    providerMocks.getStudioProviderStatus.mockReturnValue({
      configured: true,
      provider: 'openai',
      model: 'gpt-test',
      label: 'OpenAI gpt-test',
      mode: 'live',
      message: 'Live model execution is configured.',
    });
    providerMocks.generateWithStudioProvider.mockResolvedValue({
      provider: 'openai',
      model: 'gpt-test',
      text: '```json\n{"score":1.2,"reasoning":"The output matches."}\n```',
    });
    const { judgeWithLlm } = await import('../../src/eval/service.js');

    await expect(judgeWithLlm({ answer: 'yes' }, { answer: 'yes' })).resolves.toEqual({
      score: 1,
      reasoning: 'The output matches.',
    });

    expect(providerMocks.generateWithStudioProvider).toHaveBeenCalledWith({
      system: 'Score the actual output against the expected output from 0 to 1. Return strict JSON with keys score and reasoning.',
      user: JSON.stringify({ actualOutput: { answer: 'yes' }, expectedOutput: { answer: 'yes' } }),
      maxTokens: 300,
    });
  });
});
