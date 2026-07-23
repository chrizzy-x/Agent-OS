import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const providerMocks = vi.hoisted(() => ({
  generateWithStudioProvider: vi.fn(),
  getStudioProviderStatus: vi.fn(),
}));

vi.mock('../../src/studio/providers.js', () => ({
  generateWithStudioProvider: providerMocks.generateWithStudioProvider,
  getStudioProviderStatus: providerMocks.getStudioProviderStatus,
}));

import { POST } from '../../app/api/generate-feature-description/route.js';

describe('POST /api/generate-feature-description', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    providerMocks.getStudioProviderStatus.mockReturnValue({
      configured: false,
      provider: null,
      model: null,
      label: 'Super AgentOS',
      mode: 'native',
      message: 'Super AgentOS is the native AgentOS runtime.',
    });
  });

  it('generates feature copy through the Studio provider adapter', async () => {
    providerMocks.generateWithStudioProvider.mockResolvedValue({
      provider: 'openai',
      model: 'gpt-test',
      text: 'Build reusable agent workflows without wiring every runtime primitive by hand.',
    });

    const response = await POST(new NextRequest('http://localhost/api/generate-feature-description', {
      method: 'POST',
      body: JSON.stringify({ featureName: 'Workflow Builder', shortDesc: 'Create reusable workflows.' }),
    }));
    const body = await response.json();

    expect(body).toMatchObject({
      generated: true,
      description: 'Build reusable agent workflows without wiring every runtime primitive by hand.',
    });
    expect(providerMocks.generateWithStudioProvider).toHaveBeenCalledWith(expect.objectContaining({
      maxTokens: 200,
    }));
  });

  it('returns the submitted description honestly when no provider is configured', async () => {
    providerMocks.generateWithStudioProvider.mockResolvedValue(null);

    const response = await POST(new NextRequest('http://localhost/api/generate-feature-description', {
      method: 'POST',
      body: JSON.stringify({ featureName: 'Vault', shortDesc: 'Protect workspace secrets.' }),
    }));
    const body = await response.json();

    expect(body).toMatchObject({
      generated: false,
      description: 'Protect workspace secrets.',
      provider: {
        mode: 'native',
        label: 'Super AgentOS',
      },
    });
  });
});
