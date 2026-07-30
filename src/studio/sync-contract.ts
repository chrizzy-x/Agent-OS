export const STUDIO_SYNC_CONTRACT_VERSION = 'super-agentos-studio-sync-v1';

export type StudioSyncContract = {
  version: typeof STUDIO_SYNC_CONTRACT_VERSION;
  owner: 'super_agentos';
  transport: 'http_json';
  resources: {
    sessions: { cursorField: 'updatedAt'; includesDeleted: boolean };
    intelligenceSelection: { scope: 'session'; nativeAlwaysAvailable: true };
    approvals: { source: 'agent_confirmations'; cursorField: 'updatedAt' };
    tasks: { source: 'agent_tasks'; cursorField: 'updatedAt'; supportsCancellation: true; supportsRetry: true };
    notifications: { source: 'agent_notifications'; cursorField: 'createdAt' };
  };
};

export function buildStudioSyncContract(): StudioSyncContract {
  return {
    version: STUDIO_SYNC_CONTRACT_VERSION,
    owner: 'super_agentos',
    transport: 'http_json',
    resources: {
      sessions: { cursorField: 'updatedAt', includesDeleted: true },
      intelligenceSelection: { scope: 'session', nativeAlwaysAvailable: true },
      approvals: { source: 'agent_confirmations', cursorField: 'updatedAt' },
      tasks: { source: 'agent_tasks', cursorField: 'updatedAt', supportsCancellation: true, supportsRetry: true },
      notifications: { source: 'agent_notifications', cursorField: 'createdAt' },
    },
  };
}

export function changedSince<T>(items: T[], since: string | null, readTime: (item: T) => string | null): T[] {
  if (!since) return items;
  const sinceMs = Date.parse(since);
  if (!Number.isFinite(sinceMs)) return items;
  return items.filter(item => {
    const value = readTime(item);
    if (!value) return true;
    const itemMs = Date.parse(value);
    return !Number.isFinite(itemMs) || itemMs > sinceMs;
  });
}
