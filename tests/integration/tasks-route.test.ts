import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAgentContextWithTier: vi.fn(),
  createAgentTask: vi.fn(),
  listAgentTasks: vi.fn(),
}));

vi.mock('../../src/auth/request.js', () => ({
  requireAgentContextWithTier: mocks.requireAgentContextWithTier,
}));

vi.mock('../../src/tasks/service.js', () => ({
  createAgentTask: mocks.createAgentTask,
  listAgentTasks: mocks.listAgentTasks,
}));

import { POST } from '../../app/api/tasks/route.js';

describe('POST /api/tasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAgentContextWithTier.mockResolvedValue({ agentId: 'agent-1', tier: 'retail_pro' });
    mocks.createAgentTask.mockImplementation(async input => ({
      id: 'task-1',
      ...input,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
    }));
  });

  it('does not accept fake terminal task state from the request body', async () => {
    const response = await POST(new NextRequest('http://localhost/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'fake complete',
        originalPrompt: 'fake complete',
        status: 'completed',
        confirmationStatus: 'approved',
        progress: 100,
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.createAgentTask).toHaveBeenCalledWith(expect.objectContaining({
      status: 'queued',
      confirmationStatus: 'not_required',
      progress: 0,
    }));
    expect(body.task.status).toBe('queued');
  });
});
