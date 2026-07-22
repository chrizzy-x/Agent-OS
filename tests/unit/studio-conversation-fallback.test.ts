import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateStudioChatReply, streamStudioChatReply } from '../../src/studio/conversation.js';

const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;

describe('Studio conversation local fallback', () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (originalAnthropicKey) process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    else delete process.env.ANTHROPIC_API_KEY;
  });

  it('returns a structured honest answer when live model execution is not configured', async () => {
    const reply = await generateStudioChatReply({
      message: 'How should AgentOS launch the next marketplace update?',
      intent: 'REASONING',
      workspaceName: 'AgentOS',
      projectName: 'Marketplace',
    });

    expect(reply).toContain('Best next steps:');
    expect(reply).toContain('Scope: AgentOS / Marketplace');
    expect(reply).toContain('live model execution is not configured');
    expect(reply).not.toContain('{');
  });

  it('streams the same honest fallback without requiring a provider key', async () => {
    const chunks: string[] = [];
    const reply = await streamStudioChatReply({
      message: 'Research wallet UX for AgentOS users',
      intent: 'RESEARCH',
      onDelta: text => chunks.push(text),
    });

    expect(reply).toContain('Suggested execution:');
    expect(reply).toContain('Provider status:');
    expect(chunks.join('')).toBe(reply);
  });
});
