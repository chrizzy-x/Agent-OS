import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateStudioChatReply, streamStudioChatReply } from '../../src/studio/conversation.js';

const originalEnv = {
  AGENTOS_ENABLE_DEV_PROVIDER_KEYS: process.env.AGENTOS_ENABLE_DEV_PROVIDER_KEYS,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
};

describe('Studio conversation native runtime', () => {
  beforeEach(() => {
    delete process.env.AGENTOS_ENABLE_DEV_PROVIDER_KEYS;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (originalEnv.AGENTOS_ENABLE_DEV_PROVIDER_KEYS) process.env.AGENTOS_ENABLE_DEV_PROVIDER_KEYS = originalEnv.AGENTOS_ENABLE_DEV_PROVIDER_KEYS;
    else delete process.env.AGENTOS_ENABLE_DEV_PROVIDER_KEYS;
    if (originalEnv.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = originalEnv.ANTHROPIC_API_KEY;
    else delete process.env.ANTHROPIC_API_KEY;
  });

  it('returns a direct useful answer through Super AgentOS without provider credentials', async () => {
    const reply = await generateStudioChatReply({
      message: 'How should AgentOS launch the next marketplace update?',
      intent: 'REASONING',
      workspaceName: 'AgentOS',
      projectName: 'Marketplace',
    });

    expect(reply).toContain('Right now, Super AgentOS can chat');
    expect(reply).toContain('approval first');
    expect(reply).not.toContain('Here is the useful starting answer');
    expect(reply).not.toContain('Native AgentOS path:');
    expect(reply).not.toContain('{');
  });

  it('streams through Super AgentOS without requiring a provider key', async () => {
    const chunks: string[] = [];
    const reply = await streamStudioChatReply({
      message: 'Research wallet UX for AgentOS users',
      intent: 'RESEARCH',
      onDelta: text => chunks.push(text),
    });

    expect(reply).toContain('source-backed research needs');
    expect(reply).toContain('I will not invent citations');
    expect(chunks.join('')).toBe(reply);
  });

  it('handles vague follow-ups without dumping execution-path boilerplate', async () => {
    const reply = await generateStudioChatReply({
      message: 'do it then',
      intent: 'NORMAL_CHAT',
      recentMessages: [
        { role: 'user', content: 'Create project Launch Plan' },
        { role: 'assistant', content: 'Create project Launch Plan?' },
      ],
    });

    expect(reply).toContain('Use the visible Approve button');
    expect(reply).not.toContain('Super AgentOS execution path');
    expect(reply).not.toContain('I can work on');
  });
});
