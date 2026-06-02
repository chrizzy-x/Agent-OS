import { beforeEach, describe, expect, it, vi } from 'vitest';

const executorMocks = vi.hoisted(() => ({
  executeCode: vi.fn(),
}));

vi.mock('../../src/runtime/sandbox.js', () => ({
  executeCode: executorMocks.executeCode,
}));

import { executeSkillCapability } from '../../src/skills/executor.js';

describe('skill executor secret transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes runtime secrets through env instead of embedding plaintext in generated code', async () => {
    executorMocks.executeCode.mockResolvedValue({
      stdout: JSON.stringify({ ok: true, result: { done: true } }),
      stderr: '',
      durationMs: 12,
    });

    const result = await executeSkillCapability({
      sourceCode: 'class Skill { async run() { return { ok: true }; } }',
      capability: 'run',
      capabilityDefinitions: [{ name: 'run', description: 'Run' }],
      input: { job: 'demo' },
      secrets: { OPENAI_API_KEY: 'sk-live-secret-value' },
    });

    expect(result.result).toEqual({ done: true });
    expect(executorMocks.executeCode).toHaveBeenCalledTimes(1);

    const [wrappedCode, language, options] = executorMocks.executeCode.mock.calls[0];
    expect(language).toBe('javascript');
    expect(wrappedCode).toContain('AGENTOS_RUNTIME_SECRETS_B64');
    expect(wrappedCode).not.toContain('sk-live-secret-value');
    expect(options).toMatchObject({ timeoutMs: 10_000 });
    expect(options.env.AGENTOS_RUNTIME_SECRETS_B64).toBeTypeOf('string');
    expect(Buffer.from(options.env.AGENTOS_RUNTIME_SECRETS_B64, 'base64').toString('utf8')).toContain('sk-live-secret-value');
  });

  it('redacts secret-bearing execution errors before returning them', async () => {
    executorMocks.executeCode.mockResolvedValue({
      stdout: JSON.stringify({ ok: false, error: 'OPENAI_API_KEY=sk-live-secret-value' }),
      stderr: '',
      durationMs: 9,
    });

    await expect(executeSkillCapability({
      sourceCode: 'class Skill { async run() { return {}; } }',
      capability: 'run',
      capabilityDefinitions: [{ name: 'run', description: 'Run' }],
      input: {},
      secrets: { OPENAI_API_KEY: 'sk-live-secret-value' },
    })).rejects.toThrow('OPENAI_API_KEY=[redacted]');
  });
});
