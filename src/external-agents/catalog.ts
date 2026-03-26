export const EXTERNAL_AGENT_TOOL_GROUPS = [
  {
    id: 'mem',
    label: 'MEM - Memory',
    tools: [
      'agentos.mem_set',
      'agentos.mem_get',
      'agentos.mem_delete',
      'agentos.mem_list',
      'agentos.mem_incr',
      'agentos.mem_expire',
    ],
  },
  {
    id: 'net',
    label: 'NET - Network',
    tools: [
      'agentos.net_http_get',
      'agentos.net_http_post',
      'agentos.net_http_put',
      'agentos.net_http_delete',
      'agentos.net_dns_resolve',
    ],
  },
  {
    id: 'db',
    label: 'DB - Database',
    tools: [
      'agentos.db_query',
      'agentos.db_transaction',
      'agentos.db_create_table',
      'agentos.db_insert',
      'agentos.db_update',
      'agentos.db_delete',
    ],
  },
  {
    id: 'fs',
    label: 'FS - File System',
    tools: [
      'agentos.fs_write',
      'agentos.fs_read',
      'agentos.fs_list',
      'agentos.fs_delete',
      'agentos.fs_mkdir',
      'agentos.fs_stat',
    ],
  },
  {
    id: 'events',
    label: 'EVENTS',
    tools: [
      'agentos.events_publish',
      'agentos.events_subscribe',
      'agentos.events_unsubscribe',
      'agentos.events_list_topics',
    ],
  },
  {
    id: 'proc',
    label: 'PROC - Process',
    tools: [
      'agentos.proc_execute',
      'agentos.proc_schedule',
      'agentos.proc_spawn',
      'agentos.proc_kill',
      'agentos.proc_list',
    ],
  },
] as const;

export const EXTERNAL_MCP_WILDCARD = 'mcp.*';

export const DEFAULT_EXTERNAL_AGENT_TOOLS = EXTERNAL_AGENT_TOOL_GROUPS.flatMap(group => group.tools);

export const EXTERNAL_AGENT_TOOL_SET: ReadonlySet<string> = new Set(DEFAULT_EXTERNAL_AGENT_TOOLS);

export const EXTERNAL_AGENT_TOOL_EXAMPLES: Record<string, string> = {
  'agentos.net_http_get': '{\n  "url": "https://httpbin.org/get"\n}',
  'agentos.mem_set': '{\n  "key": "test-key",\n  "value": "hello from my agent"\n}',
  'agentos.mem_get': '{\n  "key": "test-key"\n}',
  'agentos.proc_execute': '{\n  "code": "print(\'AgentOS connected\')",\n  "language": "python"\n}',
  'agentos.db_query': '{\n  "sql": "SELECT 1 AS connected"\n}',
};

export const DEFAULT_CONNECT_TEST_TOOL = 'agentos.net_http_get';

