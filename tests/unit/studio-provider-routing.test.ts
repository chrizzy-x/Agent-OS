import { beforeEach, describe, expect, it, vi } from 'vitest';

const providerMocks = vi.hoisted(() => ({
  generateWithStudioProvider: vi.fn(),
  getStudioModelLabel: vi.fn(),
}));

vi.mock('../../src/studio/providers.js', () => ({
  generateWithStudioProvider: providerMocks.generateWithStudioProvider,
  getStudioModelLabel: providerMocks.getStudioModelLabel,
}));

describe('Studio provider-neutral routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    providerMocks.getStudioModelLabel.mockReturnValue('openai:gpt-test');
  });

  it('uses the Studio provider adapter for workflow planning', async () => {
    providerMocks.generateWithStudioProvider.mockResolvedValue({
      provider: 'openai',
      model: 'gpt-test',
      text: JSON.stringify({
        summary: 'Fetch BTC.',
        steps: [{
          order: 1,
          tool: 'agentos.net_http_get',
          input: { url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd' },
          description: 'Fetch BTC price.',
        }],
        schedule: null,
        missingParams: [],
      }),
    });
    const { callClaude, SYSTEM_PROMPT } = await import('../../src/studio/planner.js');

    const plan = await callClaude('check btc price');

    expect(plan.summary).toBe('Fetch BTC.');
    expect(providerMocks.generateWithStudioProvider).toHaveBeenCalledWith({
      system: SYSTEM_PROMPT,
      user: 'check btc price',
      maxTokens: 2048,
    });
  });

  it('does not use the Studio provider adapter for native intent classification', async () => {
    providerMocks.generateWithStudioProvider.mockResolvedValue({
      provider: 'openai',
      model: 'gpt-test',
      text: 'MCP_TASK',
    });
    const { detectAgentOSIntent } = await import('../../src/studio/intents.js');

    await expect(detectAgentOSIntent('run it there')).resolves.toBe('EXECUTION_TASK');

    expect(providerMocks.generateWithStudioProvider).not.toHaveBeenCalled();
  });
});
