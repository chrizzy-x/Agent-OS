import Link from 'next/link';
import DocsFooter from '@/components/DocsFooter';

interface Tool {
  name: string;
  desc: string;
  required: { field: string; type: string; desc: string }[];
  optional?: { field: string; type: string; desc: string }[];
  returns: string;
}

interface Primitive {
  id: string;
  emoji: string;
  name: string;
  tagline: string;
  backed_by: string;
  tools: Tool[];
  notes?: string[];
}

const primitives: Primitive[] = [
  {
    id: 'mem',
    emoji: '💾',
    name: 'mem — Memory Cache',
    tagline: 'Sub-millisecond key-value storage with TTL, backed by Redis.',
    backed_by: 'Redis Cloud',
    tools: [
      { name: 'mem_set', desc: 'Store a value with optional expiry.', required: [{ field: 'key', type: 'string', desc: 'Cache key (namespaced per agent)' }, { field: 'value', type: 'any', desc: 'Value to store (serialized to JSON)' }], optional: [{ field: 'ttl', type: 'number', desc: 'Seconds until expiry (omit for no expiry)' }], returns: 'true' },
      { name: 'mem_get', desc: 'Retrieve a value by key.', required: [{ field: 'key', type: 'string', desc: 'Cache key' }], returns: 'value or null' },
      { name: 'mem_delete', desc: 'Delete a key.', required: [{ field: 'key', type: 'string', desc: 'Cache key to delete' }], returns: 'true' },
      { name: 'mem_list', desc: 'List all keys with an optional prefix.', required: [], optional: [{ field: 'prefix', type: 'string', desc: 'Filter keys by prefix' }], returns: 'string[]' },
      { name: 'mem_incr', desc: 'Atomically increment a numeric key.', required: [{ field: 'key', type: 'string', desc: 'Key to increment' }], optional: [{ field: 'amount', type: 'number', desc: 'Increment by (default 1)' }], returns: 'new value (number)' },
      { name: 'mem_expire', desc: 'Update the TTL of an existing key.', required: [{ field: 'key', type: 'string', desc: 'Key to update' }, { field: 'ttl', type: 'number', desc: 'New TTL in seconds' }], returns: 'true' },
    ],
    notes: ['Keys are automatically namespaced to your agent — no key collisions between agents.', 'Memory quota tracked via Redis. Default: 100 MB per agent.'],
  },
  {
    id: 'fs',
    emoji: '🗂️',
    name: 'fs — Filesystem',
    tagline: 'Cloud file storage with per-agent isolation, backed by Supabase Storage.',
    backed_by: 'Supabase Storage (S3-compatible)',
    tools: [
      { name: 'fs_write', desc: 'Write a file (base64 encoded content).', required: [{ field: 'path', type: 'string', desc: 'File path e.g. /data/report.json' }, { field: 'data', type: 'string (base64)', desc: 'File content encoded as base64' }], optional: [{ field: 'contentType', type: 'string', desc: 'MIME type e.g. application/json' }], returns: '{ path, size_bytes }' },
      { name: 'fs_read', desc: 'Read a file (returns base64 encoded content).', required: [{ field: 'path', type: 'string', desc: 'File path to read' }], returns: '{ data (base64), contentType, size }' },
      { name: 'fs_list', desc: 'List files in a directory.', required: [{ field: 'path', type: 'string', desc: 'Directory path e.g. /data/' }], returns: '{ files: [{ name, path, size, contentType }] }' },
      { name: 'fs_delete', desc: 'Delete a file.', required: [{ field: 'path', type: 'string', desc: 'File path to delete' }], returns: 'true' },
      { name: 'fs_mkdir', desc: 'Create a directory marker.', required: [{ field: 'path', type: 'string', desc: 'Directory path' }], returns: 'true' },
      { name: 'fs_stat', desc: 'Get file metadata.', required: [{ field: 'path', type: 'string', desc: 'File path' }], returns: '{ path, size_bytes, contentType, created_at, updated_at }' },
    ],
    notes: ['All paths are isolated per agent — /data/file.txt for agent A is different from /data/file.txt for agent B.', 'Default storage quota: 1 GB per agent.', 'File data is base64-encoded in transport. Use Buffer.from(data, "base64") in Node.js.'],
  },
  {
    id: 'db',
    emoji: '🗄️',
    name: 'db — Database',
    tagline: 'Full PostgreSQL with per-agent schema isolation. Run real SQL queries safely.',
    backed_by: 'Supabase (PostgreSQL 15)',
    tools: [
      { name: 'db_create_table', desc: 'Create a new table in the agent\'s schema.', required: [{ field: 'table', type: 'string', desc: 'Table name (alphanumeric + underscore)' }, { field: 'schema', type: 'array', desc: 'Column definitions [{column, type, primaryKey?, nullable?}]' }], returns: 'true' },
      { name: 'db_insert', desc: 'Insert one or more rows.', required: [{ field: 'table', type: 'string', desc: 'Table name' }, { field: 'data', type: 'object | array', desc: 'Row data or array of rows' }], returns: 'inserted rows' },
      { name: 'db_update', desc: 'Update rows matching a condition.', required: [{ field: 'table', type: 'string', desc: 'Table name' }, { field: 'data', type: 'object', desc: 'Fields to update' }, { field: 'where', type: 'object', desc: 'WHERE clause {column: value}' }], returns: 'number of rows updated' },
      { name: 'db_delete', desc: 'Delete rows matching a condition.', required: [{ field: 'table', type: 'string', desc: 'Table name' }, { field: 'where', type: 'object', desc: 'WHERE clause {column: value}' }], returns: 'number of rows deleted' },
      { name: 'db_query', desc: 'Run a parameterized SQL query.', required: [{ field: 'sql', type: 'string', desc: 'SQL query with $1, $2 placeholders' }], optional: [{ field: 'params', type: 'array', desc: 'Parameter values for placeholders' }], returns: 'query results array' },
      { name: 'db_transaction', desc: 'Execute multiple SQL statements atomically.', required: [{ field: 'queries', type: 'string[]', desc: 'Array of SQL statements' }], returns: 'array of results' },
    ],
    notes: ['Each agent gets a private PostgreSQL schema (agent_{agentId}). No cross-agent access.', 'All queries are parameterized — SQL injection is not possible.', 'pg_catalog, information_schema, and system tables are blocked.'],
  },
  {
    id: 'net',
    emoji: '🌐',
    name: 'net — Network',
    tagline: 'Outbound HTTP with SSRF protection and domain allowlisting.',
    backed_by: 'Direct HTTP (SSRF-protected)',
    tools: [
      { name: 'net_http_get', desc: 'Make a GET request to an external URL.', required: [{ field: 'url', type: 'string', desc: 'Full URL (must be HTTPS)' }], optional: [{ field: 'headers', type: 'object', desc: 'Custom request headers' }], returns: '{ status, headers, body }' },
      { name: 'net_http_post', desc: 'Make a POST request.', required: [{ field: 'url', type: 'string', desc: 'Full URL' }, { field: 'body', type: 'any', desc: 'Request body' }], optional: [{ field: 'headers', type: 'object', desc: 'Custom request headers' }], returns: '{ status, headers, body }' },
      { name: 'net_http_put', desc: 'Make a PUT request.', required: [{ field: 'url', type: 'string', desc: 'Full URL' }, { field: 'body', type: 'any', desc: 'Request body' }], optional: [{ field: 'headers', type: 'object', desc: 'Custom request headers' }], returns: '{ status, headers, body }' },
      { name: 'net_http_delete', desc: 'Make a DELETE request.', required: [{ field: 'url', type: 'string', desc: 'Full URL' }], optional: [{ field: 'headers', type: 'object', desc: 'Custom headers' }], returns: '{ status, headers, body }' },
      { name: 'net_dns_resolve', desc: 'Resolve a hostname to IP addresses.', required: [{ field: 'hostname', type: 'string', desc: 'Domain name to resolve' }], returns: 'string[] of IP addresses' },
    ],
    notes: ['Private IP ranges are blocked (10.x, 192.168.x, 127.x, 172.16–31.x, 169.254.x).', 'Cloud metadata endpoints are blocked (metadata.google.internal, etc).', 'HTTPS is required for all requests.', 'Domain allowlisting can be configured per-agent or globally.'],
  },
  {
    id: 'proc',
    emoji: '⚙️',
    name: 'proc — Process',
    tagline: 'Sandboxed code execution for Python, JavaScript, and Bash.',
    backed_by: 'Isolated subprocess + temp directory',
    tools: [
      { name: 'proc_execute', desc: 'Execute code in a sandboxed process.', required: [{ field: 'code', type: 'string', desc: 'Source code to execute' }, { field: 'language', type: 'string', desc: '"python" | "javascript" | "bash"' }], optional: [{ field: 'timeout', type: 'number', desc: 'Max execution time in ms (default 30000, max 300000)' }, { field: 'env', type: 'object', desc: 'Additional env vars to inject' }], returns: '{ stdout, stderr, exitCode, duration_ms }' },
      { name: 'proc_schedule', desc: 'Register a cron job to run code on a schedule.', required: [{ field: 'code', type: 'string', desc: 'Code to run' }, { field: 'language', type: 'string', desc: 'Language' }, { field: 'cronExpression', type: 'string', desc: 'Cron expression e.g. "0 * * * *"' }], returns: '{ taskId, nextRunAt }' },
      { name: 'proc_spawn', desc: 'Spawn a child agent for a task.', required: [{ field: 'agentId', type: 'string', desc: 'Child agent ID to activate' }], returns: '{ processId }' },
      { name: 'proc_kill', desc: 'Kill a running process or disable a scheduled task.', required: [{ field: 'processId', type: 'string', desc: 'Process/task ID to kill' }], returns: 'true' },
      { name: 'proc_list', desc: 'List recent processes and scheduled tasks.', required: [], returns: '{ processes: [...], scheduledTasks: [...] }' },
    ],
    notes: ['Processes run in an isolated temp directory. No access to host filesystem.', 'Output (stdout/stderr) is limited to 1 MB per stream.', 'Timeout default is 30 seconds; can be up to 5 minutes (300,000 ms).'],
  },
  {
    id: 'events',
    emoji: '📡',
    name: 'events — Events',
    tagline: 'Redis-backed pub/sub messaging for agent coordination.',
    backed_by: 'Redis pub/sub',
    tools: [
      { name: 'events_publish', desc: 'Publish a message to a topic.', required: [{ field: 'topic', type: 'string', desc: 'Topic name' }, { field: 'message', type: 'any', desc: 'Message payload' }], optional: [{ field: 'isPublic', type: 'boolean', desc: 'Allow other agents to subscribe (default false)' }], returns: 'true' },
      { name: 'events_subscribe', desc: 'Get recent messages from a topic.', required: [{ field: 'topic', type: 'string', desc: 'Topic to read' }], optional: [{ field: 'since', type: 'string (ISO)', desc: 'Only messages after this timestamp' }], returns: 'message[]' },
      { name: 'events_unsubscribe', desc: 'Remove a subscription from a topic.', required: [{ field: 'topic', type: 'string', desc: 'Topic to unsubscribe from' }], returns: 'true' },
      { name: 'events_list_topics', desc: 'List all topics the agent has subscribed to.', required: [], returns: 'string[]' },
    ],
    notes: ['Topics are private by default — only your agent can publish/subscribe.', 'Public topics enable cross-agent coordination.'],
  },
];

export default function PrimitivesPage() {
  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="font-mono font-bold text-lg text-gray-900">Agent OS</Link>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <Link href="/docs" className="text-blue-600">← Docs</Link>
            <Link href="/docs/api" className="hover:text-gray-900">API Reference</Link>
            <Link href="/docs/skills" className="hover:text-gray-900">Skills</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Primitives</h1>
        <p className="text-lg text-gray-500 mb-4">
          The 6 building blocks of every Agent OS agent.
        </p>

        {/* Jump links */}
        <div className="flex flex-wrap gap-2 mb-10">
          {primitives.map(p => (
            <a key={p.id} href={`#${p.id}`}
              className="flex items-center gap-1.5 text-sm border border-gray-200 rounded-lg px-3 py-1.5 hover:border-blue-300 hover:bg-blue-50 transition-colors">
              <span>{p.emoji}</span>
              <code className="font-mono font-medium text-gray-700">{p.id}</code>
            </a>
          ))}
        </div>

        {/* Each primitive */}
        <div className="space-y-16">
          {primitives.map(p => (
            <div key={p.id} id={p.id} className="scroll-mt-8">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-4xl">{p.emoji}</span>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{p.name}</h2>
                  <p className="text-gray-500 text-sm">{p.tagline}</p>
                </div>
              </div>
              <div className="text-xs text-gray-400 mb-5">
                Backed by: <span className="font-medium text-gray-600">{p.backed_by}</span>
              </div>

              {p.notes && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-5 space-y-1">
                  {p.notes.map((n, i) => (
                    <p key={i} className="text-xs text-blue-800">• {n}</p>
                  ))}
                </div>
              )}

              <div className="space-y-4">
                {p.tools.map(tool => (
                  <div key={tool.name} className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                      <code className="font-mono font-bold text-gray-900 text-sm">{tool.name}</code>
                      <span className="text-xs text-gray-400">→ {tool.returns}</span>
                    </div>
                    <div className="px-4 py-3">
                      <p className="text-sm text-gray-600 mb-3">{tool.desc}</p>
                      {(tool.required.length > 0 || (tool.optional && tool.optional.length > 0)) && (
                        <div className="space-y-1.5">
                          {tool.required.map(f => (
                            <div key={f.field} className="flex items-start gap-2 text-xs">
                              <code className="font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded flex-shrink-0">{f.field}</code>
                              <span className="text-gray-400 flex-shrink-0">{f.type}</span>
                              <span className="text-red-400 flex-shrink-0">required</span>
                              <span className="text-gray-600">{f.desc}</span>
                            </div>
                          ))}
                          {tool.optional?.map(f => (
                            <div key={f.field} className="flex items-start gap-2 text-xs">
                              <code className="font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded flex-shrink-0">{f.field}</code>
                              <span className="text-gray-400 flex-shrink-0">{f.type}</span>
                              <span className="text-gray-400 flex-shrink-0">optional</span>
                              <span className="text-gray-600">{f.desc}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <DocsFooter />
    </div>
  );
}
