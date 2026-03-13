import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockSupabase } from '../../setup.js';
import { SecurityError } from '../../../src/utils/errors.js';

// Mock the sandbox module
vi.mock('../../../src/runtime/sandbox.js', () => ({
  executeCode: vi.fn().mockResolvedValue({
    stdout: 'Hello, World!\n',
    stderr: '',
    exitCode: 0,
    durationMs: 42,
  }),
}));

// Mock auth identity for procSpawn
vi.mock('../../../src/auth/agent-identity.js', () => ({
  createAgentToken: vi.fn().mockReturnValue('mock.jwt.token'),
  verifyAgentToken: vi.fn(),
  extractBearerToken: vi.fn(),
}));

import { procExecute, procSchedule, procSpawn, procKill, procList } from '../../../src/primitives/proc.js';
import { executeCode } from '../../../src/runtime/sandbox.js';
import type { AgentContext } from '../../../src/auth/permissions.js';

const ctx: AgentContext = {
  agentId: 'proc-agent',
  allowedDomains: [],
  quotas: {
    storageQuotaBytes: 1024 * 1024 * 1024,
    memoryQuotaBytes: 100 * 1024 * 1024,
    rateLimitPerMin: 100,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(executeCode).mockResolvedValue({ stdout: 'Hello\n', stderr: '', exitCode: 0, durationMs: 20 });

  // Default supabase chain
  const chain = {
    insert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { status: 'running' }, error: null }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  mockSupabase.from.mockReturnValue(chain);
});

describe('procExecute', () => {
  it('executes code and returns stdout/stderr/exitCode', async () => {
    const result = await procExecute(ctx, {
      code: 'console.log("Hello")',
      language: 'javascript',
      timeout: 5000,
    });
    expect(result.stdout).toBe('Hello\n');
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(typeof result.processId).toBe('string');
    expect(typeof result.durationMs).toBe('number');
  });

  it('records a process row in the DB', async () => {
    await procExecute(ctx, { code: 'print(1)', language: 'python', timeout: 5000 });
    expect(mockSupabase.from).toHaveBeenCalledWith('agent_processes');
  });

  it('marks process as failed on sandbox error', async () => {
    vi.mocked(executeCode).mockRejectedValueOnce(new SecurityError('Timed out'));
    await expect(procExecute(ctx, { code: 'while True: pass', language: 'python', timeout: 1000 }))
      .rejects.toThrow(SecurityError);
    // DB update should have been called with status: 'failed'
    const chain = mockSupabase.from.mock.results[0]?.value;
    expect(chain.update).toHaveBeenCalled();
  });
});

describe('procSchedule', () => {
  it('creates a scheduled task and returns taskId', async () => {
    const result = await procSchedule(ctx, {
      code: 'console.log("ping")',
      language: 'javascript',
      cronExpression: '*/5 * * * *',
    });
    expect(result.cronExpression).toBe('*/5 * * * *');
    expect(typeof result.taskId).toBe('string');
    expect(mockSupabase.from).toHaveBeenCalledWith('scheduled_tasks');
  });
});

describe('procSpawn', () => {
  it('creates a child agent and returns token', async () => {
    mockSupabase.from.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
    });
    const result = await procSpawn(ctx, { config: { name: 'child-1', allowedDomains: [] } });
    expect(result.childAgentId).toContain('proc-agent_child_');
    expect(result.token).toBe('mock.jwt.token');
  });
});

describe('procKill', () => {
  it('marks a running process as killed', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn()
        .mockResolvedValueOnce({ data: { status: 'running' }, error: null })
        .mockResolvedValueOnce({ data: null, error: null }),
    };
    mockSupabase.from.mockReturnValue(chain);

    const result = await procKill(ctx, { processId: '00000000-0000-0000-0000-000000000001' });
    expect(result.killed).toBe(true);
  });

  it('returns killed: false when process is already completed', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { status: 'completed' }, error: null }),
    };
    mockSupabase.from.mockReturnValue(chain);

    const result = await procKill(ctx, { processId: '00000000-0000-0000-0000-000000000002' });
    expect(result.killed).toBe(false);
  });
});

describe('procList', () => {
  it('returns processes and scheduled tasks', async () => {
    const processes = [{ id: 'abc', language: 'javascript', status: 'completed', exit_code: 0, duration_ms: 50, created_at: '2025-01-01', completed_at: '2025-01-01' }];
    const tasks = [{ id: 'task-1', language: 'python', cron_expression: '0 * * * *', enabled: true, last_run_at: null, next_run_at: null, created_at: '2025-01-01' }];

    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn()
        .mockResolvedValueOnce({ data: processes, error: null })
        .mockResolvedValueOnce({ data: tasks, error: null }),
    };
    mockSupabase.from.mockReturnValue(chain);

    const result = await procList(ctx, { status: 'all', limit: 20 });
    expect(result.processes).toHaveLength(1);
    expect(result.scheduledTasks).toHaveLength(1);
  });
});
