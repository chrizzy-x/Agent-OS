import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSupabase } from '../setup.js';

const persistenceMocks = vi.hoisted(() => ({
  assertWorkspaceMembership: vi.fn(),
  supabaseRestRows: vi.fn(),
}));

vi.mock('../../src/workspaces/service.js', () => ({
  assertWorkspaceMembership: persistenceMocks.assertWorkspaceMembership,
}));

vi.mock('../../src/storage/supabase-rest.js', () => ({
  supabaseRestRows: persistenceMocks.supabaseRestRows,
}));

import { getStudioSessionBundle, listStudioSessions } from '../../src/studio/persistence.js';

const sessionRow = {
  id: 'session-1',
  workspace_id: 'workspace-1',
  owner_agent_id: 'agent-1',
  super_agent_id: null,
  project_id: null,
  title: 'Recovered Session',
  status: 'active',
  state: {},
  created_at: '2026-08-08T00:00:00Z',
  updated_at: '2026-08-08T00:05:00Z',
};

function queryBuilder(data: Array<Record<string, unknown>>, error: unknown = null) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    abortSignal: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: data[0] ?? null, error }),
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve({ data, error }).then(resolve, reject);
    },
  };
  return query;
}

describe('studio persistence REST fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistenceMocks.assertWorkspaceMembership.mockResolvedValue(undefined);
    persistenceMocks.supabaseRestRows.mockImplementation((table: string) => {
      if (table === 'nl_studio_sessions') return Promise.resolve([sessionRow]);
      return Promise.resolve([]);
    });
  });

  it('loads a requested session bundle through REST before using the primary client', async () => {
    persistenceMocks.supabaseRestRows.mockImplementation((table: string) => {
      if (table === 'nl_studio_sessions') return Promise.resolve([sessionRow]);
      if (table === 'nl_studio_messages') {
        return Promise.resolve([{
          id: 'message-1',
          session_id: 'session-1',
          role: 'user',
          content: 'continue the research',
          created_at: '2026-08-08T00:01:00Z',
        }]);
      }
      if (table === 'nl_studio_events') {
        return Promise.resolve([{
          id: 'event-1',
          session_id: 'session-1',
          type: 'task_started',
          payload: { task: 'research' },
          created_at: '2026-08-08T00:02:00Z',
        }]);
      }
      return Promise.resolve([]);
    });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'nl_studio_sessions') return queryBuilder([], { message: 'timeout' });
      if (table === 'nl_studio_messages') {
        return queryBuilder([{
          id: 'message-1',
          session_id: 'session-1',
          role: 'user',
          content: 'continue the research',
          created_at: '2026-08-08T00:01:00Z',
        }]);
      }
      if (table === 'nl_studio_events') {
        return queryBuilder([{
          id: 'event-1',
          session_id: 'session-1',
          type: 'task_started',
          payload: { task: 'research' },
          created_at: '2026-08-08T00:02:00Z',
        }]);
      }
      throw new Error(`unexpected table ${table}`);
    });

    const bundle = await getStudioSessionBundle('agent-1', 'session-1');

    expect(bundle.session.id).toBe('session-1');
    expect(bundle.messages[0].content).toBe('continue the research');
    expect(bundle.events[0].type).toBe('task_started');
    expect(persistenceMocks.supabaseRestRows).toHaveBeenCalledWith('nl_studio_sessions', expect.objectContaining({
      id: 'eq.session-1',
      owner_agent_id: 'eq.agent-1',
      deleted_at: 'is.null',
    }), expect.any(Number));
    expect(persistenceMocks.supabaseRestRows).toHaveBeenCalledWith('nl_studio_messages', expect.objectContaining({
      session_id: 'eq.session-1',
      order: 'created_at.asc',
    }), expect.any(Number));
  });

  it('loads the session list through REST before local fallback', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'nl_studio_sessions') return queryBuilder([], { message: 'timeout' });
      throw new Error(`unexpected table ${table}`);
    });

    const sessions = await listStudioSessions('agent-1', { status: 'active', limit: 10 });

    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('session-1');
    expect(persistenceMocks.supabaseRestRows).toHaveBeenCalledWith('nl_studio_sessions', expect.objectContaining({
      owner_agent_id: 'eq.agent-1',
      status: 'eq.active',
      deleted_at: 'is.null',
      limit: '10',
    }), expect.any(Number));
  });
});
