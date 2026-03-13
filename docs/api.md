# AgentOS API Reference

AgentOS exposes OS-level primitives to AI agents over HTTP. All requests are authenticated with a JWT bearer token.

## Base URL

```
https://your-deployment.vercel.app
```

## Authentication

Every request to `/mcp` must include a signed JWT in the Authorization header:

```
Authorization: Bearer <jwt-token>
```

Tokens are issued via `POST /admin/agents` using the admin token. A token encodes the agent's identity, allowed domains, and resource quotas. Tokens expire after 30 days by default.

**Create an agent token (admin only):**
```
POST /admin/agents
Authorization: Bearer <ADMIN_TOKEN>
Content-Type: application/json

{
  "agentId": "my-agent-001",
  "allowedDomains": ["api.openai.com", "httpbin.org"],
  "expiresIn": "30d"
}
```

Response:
```json
{
  "agentId": "my-agent-001",
  "token": "<jwt>",
  "expiresIn": "30d"
}
```

---

## Endpoints

### `GET /health`
Returns server status. No authentication required.

```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2025-01-15T12:00:00.000Z",
  "tools": 27
}
```

### `GET /tools`
Lists all available tool names. No authentication required.

### `POST /mcp`
Executes a tool call.

**Request:**
```json
{
  "tool": "<tool_name>",
  "input": { ... }
}
```

**Response (success):**
```json
{
  "result": { ... }
}
```

**Response (error):**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "...",
    "statusCode": 400
  }
}
```

---

## Tools

### Memory Primitive (`mem_*`)

Key-value store backed by Redis. Keys are scoped to the agent namespace.

#### `mem_set`
Store a value under a key.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | string | yes | Key name (alphanumeric, `_:.-/`, max 512 chars) |
| `value` | any | yes | Value to store (JSON-serialized) |
| `ttl` | integer | no | TTL in seconds (1–2592000, default 7 days) |

Returns: `{ key: string }`

#### `mem_get`
Retrieve a stored value.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | string | yes | Key to retrieve |

Returns: `{ key: string, value: any }`
Throws: `NOT_FOUND` if key does not exist.

#### `mem_delete`
Delete a key.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | string | yes | Key to delete |

Returns: `{ key: string, deleted: boolean }`

#### `mem_list`
List keys by prefix.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prefix` | string | no | Key prefix filter (default: `""` = all keys) |

Returns: `{ keys: string[] }` (max 1000 keys)

#### `mem_incr`
Atomically increment a numeric counter.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | string | yes | Counter key |
| `amount` | integer | no | Amount to increment (default: 1) |

Returns: `{ key: string, value: number }`

#### `mem_expire`
Set or update the TTL on an existing key.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | string | yes | Key to update |
| `seconds` | integer | yes | New TTL in seconds (1–2592000) |

Returns: `{ key: string, set: boolean }` — `set: false` if key does not exist.

---

### Filesystem Primitive (`fs_*`)

File storage backed by Supabase Storage. Each agent has an isolated namespace.
Files are transmitted as base64-encoded strings.

#### `fs_write`
Write a file.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | yes | File path (max 1024 chars, no `..` traversal) |
| `data` | string | yes | File content base64-encoded (max 100MB) |
| `contentType` | string | no | MIME type (default: `application/octet-stream`) |

Returns: `{ path: string, sizeBytes: number }`

#### `fs_read`
Read a file.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | yes | File path |

Returns: `{ path: string, data: string, contentType: string, sizeBytes: number }`
`data` is base64-encoded.

#### `fs_list`
List files and directories.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | no | Directory path (default: `/`) |

Returns: `{ path: string, entries: Array<{ name, path, sizeBytes, type }> }`

#### `fs_delete`
Delete a file.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | yes | File path |

Returns: `{ path: string, deleted: boolean }`

#### `fs_mkdir`
Create a directory (writes a `.keep` placeholder file since storage is flat).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | yes | Directory path |

Returns: `{ path: string }`

#### `fs_stat`
Get file metadata without reading content.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | yes | File path |

Returns: `{ path, sizeBytes, contentType, createdAt, updatedAt }`

---

### Database Primitive (`db_*`)

Private PostgreSQL schema per agent. All queries are parameterized — never interpolate user data into SQL.

#### `db_query`
Run a SELECT (or any read-only SQL) query.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sql` | string | yes | SQL query (max 100KB) |
| `params` | array | no | Positional parameters `$1, $2, ...` |

Returns: `{ rows: any[], rowCount: number }`

**Example:**
```json
{
  "tool": "db_query",
  "input": {
    "sql": "SELECT * FROM users WHERE email = $1",
    "params": ["alice@example.com"]
  }
}
```

#### `db_transaction`
Execute multiple statements atomically.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `queries` | array | yes | Array of `{ sql, params }` objects (max 50) |

Returns: `{ results: Array<{ rows, rowCount }> }`

#### `db_create_table`
Create a table in the agent's private schema.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `table` | string | yes | Table name (alphanumeric + `_`, max 63 chars) |
| `schema` | array | yes | Column definitions (see below) |

Column definition:
```json
{
  "column": "id",
  "type": "uuid",
  "nullable": false,
  "primaryKey": true
}
```

Allowed types: `text`, `integer`, `bigint`, `boolean`, `real`, `jsonb`, `timestamptz`, `uuid`

Returns: `{ table: string, created: boolean }`

#### `db_insert`
Insert a row.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `table` | string | yes | Table name |
| `data` | object | yes | Column values as key-value pairs |

Returns: `{ table: string, row: object }`

#### `db_update`
Update rows matching conditions.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `table` | string | yes | Table name |
| `data` | object | yes | Columns and new values |
| `where` | object | yes | Equality filter conditions |

Returns: `{ table: string, updatedCount: number }`

#### `db_delete`
Delete rows matching conditions.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `table` | string | yes | Table name |
| `where` | object | yes | Equality filter conditions (required — prevents accidental full-table delete) |

Returns: `{ table: string, deletedCount: number }`

---

### Network Primitive (`net_*`)

Proxied HTTPS requests. Subject to domain allowlist and SSRF protection. Only HTTPS is permitted.

#### `net_http_get`
Make an HTTP GET request.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | yes | Target URL (HTTPS only, max 2048 chars) |
| `headers` | object | no | Request headers |

Returns: `{ status, headers, body, contentType }`
Binary responses are base64-encoded. Text/JSON responses are UTF-8 strings.

#### `net_http_post`
Make an HTTP POST request.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | yes | Target URL |
| `body` | any | yes | Request body (JSON-serialized if object) |
| `headers` | object | no | Request headers |

Returns: `{ status, headers, body, contentType }`

#### `net_http_put`
Make an HTTP PUT request. Same fields as `net_http_post`.

#### `net_http_delete`
Make an HTTP DELETE request. Same fields as `net_http_get`.

#### `net_dns_resolve`
Resolve a hostname to IP addresses.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `hostname` | string | yes | Hostname to resolve (max 253 chars) |

Returns: `{ hostname: string, addresses: string[] }`

---

### Events Primitive (`events_*`)

Lightweight pub/sub backed by Redis lists. Topics are scoped to the agent by default; set `isPublic: true` to share across agents.

#### `events_publish`
Publish a message to a topic.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `topic` | string | yes | Topic name (max 512 chars) |
| `message` | any | yes | Message payload (max 1MB) |
| `isPublic` | boolean | no | Publish to shared channel (default: false) |

Returns: `{ topic: string, messageId: string }`

#### `events_subscribe`
Subscribe to a topic and receive recent messages.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `topic` | string | yes | Topic name |
| `isPublic` | boolean | no | Listen on shared channel (default: false) |
| `limit` | integer | no | Number of recent messages to return (default: 10, max: 100) |

Returns: `{ subscriptionId: string, topic: string, recentMessages: any[] }`

Poll for new messages by calling `events_subscribe` again with the same topic. The `subscriptionId` is stored but polling is the mechanism — there is no long-lived push connection.

#### `events_unsubscribe`
Remove a subscription record.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `subscriptionId` | string | yes | Subscription ID from `events_subscribe` |

Returns: `{ subscriptionId: string, unsubscribed: boolean }`

#### `events_list_topics`
List all topics that have messages.

No input fields.

Returns: `{ topics: Array<{ topic, messageCount, isPublic }> }`

---

### Process Primitive (`proc_*`)

Code execution and lifecycle management.

#### `proc_execute`
Execute code and return the result synchronously.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | yes | Source code to execute (max 1MB) |
| `language` | string | yes | `python`, `javascript`, or `bash` |
| `timeout` | integer | no | Timeout in ms (1000–300000, default: 30000) |

Returns: `{ processId, stdout, stderr, exitCode, durationMs }`

#### `proc_schedule`
Register a recurring cron job.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | yes | Source code |
| `language` | string | yes | `python`, `javascript`, or `bash` |
| `cronExpression` | string | yes | Standard 5-field cron expression |

Returns: `{ taskId: string, cronExpression: string, language: string }`

#### `proc_spawn`
Create a child agent with an isolated identity.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `config.name` | string | no | Human-readable name |
| `config.allowedDomains` | string[] | no | Domain allowlist for the child agent |

Returns: `{ childAgentId: string, token: string }` — the token expires in 24 hours.

#### `proc_kill`
Kill a running process or disable a scheduled task.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `processId` | string (UUID) | yes | Process or task ID |

Returns: `{ processId: string, killed: boolean }`

#### `proc_list`
List processes and scheduled tasks.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | string | no | Filter: `running`, `completed`, `failed`, `killed`, or `all` (default) |
| `limit` | integer | no | Max results (default: 20, max: 100) |

Returns: `{ processes: any[], scheduledTasks: any[] }`

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid JWT token |
| `SECURITY_VIOLATION` | 403 | SSRF attempt, path traversal, or blocked domain |
| `PERMISSION_DENIED` | 403 | Agent lacks permission for the operation |
| `NOT_FOUND` | 404 | Requested resource does not exist |
| `VALIDATION_ERROR` | 400 | Input failed schema validation |
| `QUOTA_EXCEEDED` | 429 | Storage or memory quota exceeded |
| `RATE_LIMITED` | 429 | Rate limit reached (try again next minute) |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Rate Limits

- **Default**: 100 requests per minute per agent
- Configurable per-agent via JWT claim `quotas.rateLimitPerMin`
- Exceeded requests return `429 RATE_LIMITED`

## Resource Quotas

| Resource | Default | Configurable |
|----------|---------|--------------|
| Storage | 1 GB | Yes, per-agent |
| Redis memory | 100 MB | Yes, per-agent |
| HTTP rate limit | 100 req/min | Yes, per-agent |
| Max file size | 100 MB | No |
| Max process timeout | 5 min | No |
