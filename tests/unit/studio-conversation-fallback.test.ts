import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateStudioChatReply, streamStudioChatReply } from '../../src/studio/conversation.js';
import type { AgentContext } from '../../src/auth/permissions.js';

const originalEnv = {
  AGENTOS_ENABLE_DEV_PROVIDER_KEYS: process.env.AGENTOS_ENABLE_DEV_PROVIDER_KEYS,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
};

describe('Studio conversation native runtime', () => {
  const agentContext: AgentContext = {
    agentId: 'agent-1',
    allowedDomains: ['api.wikimedia.org', 'en.wikipedia.org'],
    quotas: {
      storageQuotaBytes: 1024,
      memoryQuotaBytes: 1024,
      rateLimitPerMin: 100,
    },
    tier: 'retail_free',
  };

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
      message: 'Research the Iran war 2026. Give me a careful summary with timeline, key actors, current status, risks, and what remains uncertain.',
      intent: 'RESEARCH',
      agentContext,
      researchFetcher: async url => {
        if (url.includes('/search/page')) {
          return {
            status: 200,
            body: JSON.stringify({
              pages: [
                { key: '2026_Iran_war', title: '2026 Iran war', description: 'Ongoing armed conflict in West Asia' },
                { key: 'Iran', title: 'Iran', description: 'Country in West Asia' },
              ],
            }),
          };
        }
        if (url.includes('/summary/2026_Iran_war')) {
          return {
            status: 200,
            body: JSON.stringify({
              title: '2026 Iran war',
              description: 'Ongoing armed conflict in West Asia',
              timestamp: '2026-07-30T14:43:20Z',
              extract: 'Since 28 February 2026, the United States and Israel have been at war with Iran and its regional allies.',
              content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/2026_Iran_war' } },
            }),
          };
        }
        return {
          status: 200,
          body: JSON.stringify({
            query: {
              pages: {
                1: {
                  extract: 'Since 28 February 2026, the United States and Israel have been at war with Iran and its regional allies. Iranian units responded with missile and drone attacks against regional targets.',
                },
              },
            },
          }),
        };
      },
      onDelta: text => chunks.push(text),
    });

    expect(reply).toContain('Native research brief: 2026 Iran war');
    expect(reply).toContain('Current status:');
    expect(reply).toContain('Timeline:');
    expect(reply).toContain('Key actors:');
    expect(reply).toContain('Sources:');
    expect(reply).not.toContain('source-backed research needs');
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
