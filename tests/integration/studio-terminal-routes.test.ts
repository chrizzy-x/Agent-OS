import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as createTerminal } from '../../app/api/studio/terminals/route.js';
import { GET as getTerminal, DELETE as closeTerminal } from '../../app/api/studio/terminals/[id]/route.js';
import { POST as sendInput } from '../../app/api/studio/terminals/[id]/input/route.js';

const {
  requireRouteCapability,
  createStudioTerminalSessionViaRuntime,
  getStudioTerminalSessionViaRuntime,
  closeStudioTerminalSessionViaRuntime,
  sendStudioTerminalInputViaRuntime,
} = vi.hoisted(() => ({
  requireRouteCapability: vi.fn(),
  createStudioTerminalSessionViaRuntime: vi.fn(),
  getStudioTerminalSessionViaRuntime: vi.fn(),
  closeStudioTerminalSessionViaRuntime: vi.fn(),
  sendStudioTerminalInputViaRuntime: vi.fn(),
}));

vi.mock('../../src/auth/request.js', () => ({
  requireRouteCapability,
}));

vi.mock('../../src/studio/terminal-runtime.js', () => ({
  createStudioTerminalSessionViaRuntime,
  getStudioTerminalSessionViaRuntime,
  closeStudioTerminalSessionViaRuntime,
  sendStudioTerminalInputViaRuntime,
}));

describe('studio terminal routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRouteCapability.mockResolvedValue({ agentId: 'agent-1' });
  });

  it('creates and inspects terminal sessions with advanced-mode gating', async () => {
    createStudioTerminalSessionViaRuntime.mockResolvedValue({ id: 'terminal-1', projectId: 'project-1', shell: 'PowerShell', cwd: 'C:/tmp', status: 'idle', createdAt: 'now', updatedAt: 'now', events: [] });
    getStudioTerminalSessionViaRuntime.mockResolvedValue({ id: 'terminal-1', projectId: 'project-1', shell: 'PowerShell', cwd: 'C:/tmp', status: 'idle', createdAt: 'now', updatedAt: 'now', events: [] });

    const createResponse = await createTerminal(new NextRequest('http://localhost/api/studio/terminals', {
      method: 'POST',
      body: JSON.stringify({ projectId: 'project-1', advancedMode: true }),
      headers: { 'Content-Type': 'application/json' },
    }));
    const getResponse = await getTerminal(new NextRequest('http://localhost/api/studio/terminals/terminal-1'), {
      params: Promise.resolve({ id: 'terminal-1' }),
    });

    expect(createResponse.status).toBe(201);
    expect(getResponse.status).toBe(200);
    expect(createStudioTerminalSessionViaRuntime).toHaveBeenCalledWith({ agentId: 'agent-1' }, {
      projectId: 'project-1',
      advancedMode: true,
    });
  });

  it('sends terminal input and closes terminal sessions', async () => {
    sendStudioTerminalInputViaRuntime.mockResolvedValue({ accepted: true, marker: '1', session: { id: 'terminal-1' } });
    closeStudioTerminalSessionViaRuntime.mockResolvedValue({ closed: true });

    const inputResponse = await sendInput(new NextRequest('http://localhost/api/studio/terminals/terminal-1/input', {
      method: 'POST',
      body: JSON.stringify({ input: 'dir', advancedMode: true }),
      headers: { 'Content-Type': 'application/json' },
    }), {
      params: Promise.resolve({ id: 'terminal-1' }),
    });
    const closeResponse = await closeTerminal(new NextRequest('http://localhost/api/studio/terminals/terminal-1', {
      method: 'DELETE',
    }), {
      params: Promise.resolve({ id: 'terminal-1' }),
    });

    expect(inputResponse.status).toBe(200);
    expect(closeResponse.status).toBe(200);
    expect(sendStudioTerminalInputViaRuntime).toHaveBeenCalledWith({ agentId: 'agent-1' }, 'terminal-1', {
      input: 'dir',
      advancedMode: true,
    });
  });
});
