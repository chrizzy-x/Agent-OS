import { AgentOSClient } from './client.js';

function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const output = search.toString();
  return output ? `?${output}` : '';
}

export function createV64Sdk(client: AgentOSClient) {
  return {
    agent: {
      create: (input: Record<string, unknown>) => client.request('/api/subagents', { method: 'POST', body: JSON.stringify(input) }),
      visibility: (id: string, visibility: 'private' | 'workspace' | 'public') => client.request(`/api/subagents/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ visibility }) }),
      permissions: (id: string) => client.request(`/api/permissions/grants${query({ sourceType: 'subagent', sourceId: id })}`),
      share: (id: string, targetAgentId: string, permission = 'agent:invoke') => client.request('/api/permissions/grants', {
        method: 'POST',
        body: JSON.stringify({ sourceType: 'subagent', sourceId: id, targetType: 'agent', targetId: targetAgentId, permission }),
      }),
      revoke: (grantId: string) => client.request(`/api/permissions/grants${query({ grantId })}`, { method: 'DELETE' }),
    },
    memory: {
      set: (input: Record<string, unknown>) => client.request('/api/memory', { method: 'POST', body: JSON.stringify(input) }),
      get: (params: Record<string, string | number | boolean | null | undefined>) => client.request(`/api/memory${query({ ...params, limit: 1 })}`),
      search: (params: Record<string, string | number | boolean | null | undefined>) => client.request(`/api/memory${query(params)}`),
      share: (input: Record<string, unknown>) => client.request('/api/memory', { method: 'POST', body: JSON.stringify(input) }),
      revoke: (params: Record<string, string | number | boolean | null | undefined>) => client.request(`/api/memory${query(params)}`, { method: 'DELETE' }),
    },
    files: {
      upload: (input: Record<string, unknown>) => client.request('/api/files', { method: 'POST', body: JSON.stringify(input) }),
      search: (params: Record<string, string | number | boolean | null | undefined>) => client.request(`/api/files${query(params)}`),
      share: (fileId: string, targetAgentId: string) => client.request('/api/permissions/grants', {
        method: 'POST',
        body: JSON.stringify({ sourceType: 'file', sourceId: fileId, targetType: 'agent', targetId: targetAgentId, permission: 'file:read' }),
      }),
      revoke: (grantId: string) => client.request(`/api/permissions/grants${query({ grantId })}`, { method: 'DELETE' }),
    },
    knowledge: {
      add: (input: Record<string, unknown>) => client.request('/api/memory', {
        method: 'POST',
        body: JSON.stringify({ namespaceType: 'workspace', visibility: 'workspace', ...input }),
      }),
      search: (params: Record<string, string | number | boolean | null | undefined>) => client.request(`/api/memory${query({ namespaceType: 'workspace', ...params })}`),
      share: (input: Record<string, unknown>) => client.request('/api/memory', {
        method: 'POST',
        body: JSON.stringify({ namespaceType: 'workspace', visibility: 'workspace', ...input }),
      }),
      revoke: (params: Record<string, string | number | boolean | null | undefined>) => client.request(`/api/memory${query(params)}`, { method: 'DELETE' }),
    },
    vault: {
      createSecret: (input: Record<string, unknown>) => client.request('/api/vault', { method: 'POST', body: JSON.stringify(input) }),
      grant: (input: Record<string, unknown>) => client.request('/api/vault/assignments', { method: 'POST', body: JSON.stringify(input) }),
      revoke: (params: Record<string, string | number | boolean | null | undefined>) => client.request(`/api/vault/assignments${query(params)}`, { method: 'DELETE' }),
      useSecret: (input: Record<string, unknown>) => client.request('/api/vault/access', { method: 'POST', body: JSON.stringify({ action: 'runtime', ...input }) }),
    },
    workflow: {
      create: (input: Record<string, unknown>) => client.request('/api/agent/workflows', { method: 'POST', body: JSON.stringify(input) }),
      run: (workflowId: string, force = true) => client.request('/api/agent/workflows/run-due', { method: 'POST', body: JSON.stringify({ workflowId, force }) }),
      publish: (workflowId: string, visibility: 'public' | 'workspace' = 'public') => client.request(`/api/agent/workflows/${encodeURIComponent(workflowId)}`, { method: 'PATCH', body: JSON.stringify({ visibility }) }),
      share: (workflowId: string, targetAgentId: string) => client.request('/api/permissions/grants', {
        method: 'POST',
        body: JSON.stringify({ sourceType: 'workflow', sourceId: workflowId, targetType: 'agent', targetId: targetAgentId, permission: 'workflow:read' }),
      }),
      revoke: (grantId: string) => client.request(`/api/permissions/grants${query({ grantId })}`, { method: 'DELETE' }),
    },
    chat: {
      searchCurrent: (sessionId: string, q: string) => client.request(`/api/studio/sessions/${encodeURIComponent(sessionId)}/search${query({ q })}`),
      searchAll: (q: string, scope: 'current' | 'workspace' | 'all' = 'all', sessionId?: string) => client.request(`/api/search/chats${query({ q, scope, sessionId })}`),
    },
    app: {
      register: (input: Record<string, unknown>) => client.request('/api/apps', { method: 'POST', body: JSON.stringify(input) }),
      publish: (slug: string, input: Record<string, unknown>) => client.request(`/api/apps/${encodeURIComponent(slug)}`, { method: 'PATCH', body: JSON.stringify(input) }),
      permissions: (slug: string) => client.request(`/api/apps/${encodeURIComponent(slug)}/readiness`),
    },
  };
}
