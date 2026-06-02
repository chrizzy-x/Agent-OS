import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createAgentToken } from '../../src/auth/agent-identity.js';

const skillRouteMocks = vi.hoisted(() => ({
  runInstalledSkill: vi.fn(),
}));

vi.mock('../../src/skills/service.js', () => ({
  runInstalledSkill: skillRouteMocks.runInstalledSkill,
}));

import { POST } from '../../app/api/skills/use/route.js';

describe('POST /api/skills/use', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redacts secret-like values from skill execution responses', async () => {
    skillRouteMocks.runInstalledSkill.mockResolvedValue({
      result: {
        token: 'sk-live-secret-value',
        note: 'OPENAI_API_KEY=sk-live-secret-value',
      },
      executionTimeMs: 8,
      stderr: '',
    });

    const token = createAgentToken('agent-1', { expiresIn: '1h' });
    const request = new NextRequest('http://localhost/api/skills/use', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        skill_slug: 'research-skill',
        capability: 'run',
        params: { query: 'hello' },
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.result.token).toBe('[redacted]');
    expect(body.result.note).toBe('OPENAI_API_KEY=[redacted]');
  });
});
