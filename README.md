# AgentOS

> Built by **riz**

**OS-level primitives for apps and services — memory, files, databases, networking, events, and code execution over a single authenticated HTTP API.**

🚀 **Live:** [agent-os-one-eta.vercel.app](https://agent-os-one-eta.vercel.app) · [Get started free →](https://agent-os-one-eta.vercel.app/signup)

AgentOS is a stateless server that gives any app or service a safe, isolated environment to persist data, run code, make HTTP requests, and communicate — without touching the host system directly. Each client gets its own namespace, enforced quotas, and a full audit trail.

---

## What it does

Apps and services call tools via HTTP. Most integrations are stateless — they process a request and forget everything. AgentOS gives any client **persistent state and system access** by exposing six OS primitives as tools:

| Primitive | What it gives agents | Backed by |
|-----------|---------------------|-----------|
| **mem** | Key-value store (set, get, list, increment, expire) | Redis |
| **fs** | File read/write/list/delete/stat | Supabase Storage |
| **db** | Private SQL database (create tables, query, insert, update, delete) | PostgreSQL (Supabase) |
| **net** | Outbound HTTP requests + DNS resolution | Node.js `fetch` |
| **events** | Pub/sub messaging between agents | Redis |
| **proc** | Code execution (Python, JavaScript, Bash) + cron scheduling + child agents | Sandboxed subprocess |

Every operation is scoped to the calling client's identity, quota-checked, rate-limited, and written to an immutable audit log.

---

## Architecture

```
Client App / Service
   │  Authorization: Bearer <jwt>
   ▼
POST /mcp  { "tool": "mem_set", "input": { "key": "...", "value": "..." } }
   │
   ├── JWT verification (jsonwebtoken)
   ├── Rate limit check (Redis sliding window)
   │
   ├── mem_*     → Redis (ioredis)
   ├── fs_*      → Supabase Storage
   ├── db_*      → PostgreSQL via Supabase RPC (agent-scoped schema)
   ├── net_*     → fetch() with SSRF protection + domain allowlist
   ├── events_*  → Redis lists + pub/sub
   └── proc_*    → Sandboxed child process (isolated tmpdir, stripped env)
        │
        └── Audit log → Supabase (async, fire-and-forget)
```

Deployed as a single Vercel serverless function. No persistent processes, no shared state between requests.

---

## Quickstart

### Option A: Use the hosted version

[Sign up at agent-os-one-eta.vercel.app/signup](https://agent-os-one-eta.vercel.app/signup) — get your Agent ID and API key in 30 seconds, no credit card required.

### Option B: Self-host

#### 1. Clone and install

```bash
git clone https://github.com/chrizzy-x/Agent-OS.git
cd Agent-OS
npm install
```

#### 2. Set environment variables

Copy the example and fill in your values (see below for where to get each one):

```bash
cp .env.example .env
```

#### 3. Run the database migrations

In your Supabase project → **SQL Editor** → run these in order:

```
src/storage/migrations/001_initial.sql
src/storage/migrations/002_agent_db_functions.sql
src/storage/migrations/003_scheduled_task_runner.sql
```

#### 4. Run locally

```bash
npm run dev
```

Server starts on `http://localhost:3000`.

#### 5. Create your first agent

```bash
curl -X POST http://localhost:3000/admin/agents \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agentId": "my-agent", "allowedDomains": ["api.openai.com"]}'
```

Response:
```json
{
  "agentId": "my-agent",
  "token": "eyJ...",
  "expiresIn": "30d"
}
```

#### 6. Call a tool

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d '{"tool": "mem_set", "input": {"key": "counter", "value": 0}}'
```

---

## All 27 tools

### Memory (`mem_*`)
| Tool | Description |
|------|-------------|
| `mem_set` | Store any JSON value under a key, with optional TTL |
| `mem_get` | Retrieve a stored value |
| `mem_delete` | Delete a key |
| `mem_list` | List keys by prefix (max 1000) |
| `mem_incr` | Atomically increment a numeric counter |
| `mem_expire` | Update the TTL on an existing key |

### Filesystem (`fs_*`)
| Tool | Description |
|------|-------------|
| `fs_write` | Write a file (base64-encoded, max 100MB) |
| `fs_read` | Read a file (returns base64) |
| `fs_list` | List files and directories |
| `fs_delete` | Delete a file |
| `fs_mkdir` | Create a directory |
| `fs_stat` | Get file metadata (size, content type, timestamps) |

### Database (`db_*`)
| Tool | Description |
|------|-------------|
| `db_query` | Run a parameterized SQL query |
| `db_transaction` | Run multiple statements atomically |
| `db_create_table` | Create a table in the agent's private schema |
| `db_insert` | Insert a row |
| `db_update` | Update rows matching a condition |
| `db_delete` | Delete rows matching a condition |

### Network (`net_*`)
| Tool | Description |
|------|-------------|
| `net_http_get` | Make an HTTPS GET request |
| `net_http_post` | Make an HTTPS POST request |
| `net_http_put` | Make an HTTPS PUT request |
| `net_http_delete` | Make an HTTPS DELETE request |
| `net_dns_resolve` | Resolve a hostname to IP addresses |

### Events (`events_*`)
| Tool | Description |
|------|-------------|
| `events_publish` | Publish a message to a topic |
| `events_subscribe` | Subscribe and fetch recent messages |
| `events_unsubscribe` | Remove a subscription |
| `events_list_topics` | List topics with messages |

### Process (`proc_*`)
| Tool | Description |
|------|-------------|
| `proc_execute` | Run code synchronously (Python/JS/Bash) |
| `proc_schedule` | Register a cron job |
| `proc_spawn` | Create a child agent with its own identity |
| `proc_kill` | Kill a process or disable a scheduled task |
| `proc_list` | List running and scheduled processes |

---

## Security

Security is the core design constraint. Every tool call goes through:

1. **JWT authentication** — every request must carry a signed token
2. **SSRF protection** — all outbound URLs are DNS-resolved and checked against blocked IP ranges (RFC1918, loopback, link-local, cloud metadata endpoints)
3. **Domain allowlist** — agents can only reach domains explicitly listed in their token or the global `ALLOWED_DOMAINS` env var
4. **Namespace isolation** — Redis keys, file paths, and database schemas are all prefixed with the agent ID derived from the verified token
5. **Path traversal prevention** — `../` sequences in file paths are detected and rejected before any storage call
6. **Parameterized queries only** — all database operations use PostgreSQL stored procedures with parameterized inputs; user strings are never interpolated into SQL
7. **Rate limiting** — sliding window counter in Redis, configurable per agent
8. **Quota enforcement** — storage and memory usage tracked and capped per agent
9. **Audit logging** — every operation (success or failure) recorded to Supabase with duration, metadata, and error details
10. **Sandbox isolation** — `proc_execute` runs code in a stripped subprocess with an isolated tmpdir, no inherited env vars, and a hard kill timeout

See [docs/security.md](docs/security.md) for the full threat model.

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | ✅ | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | ✅ | Supabase service role key (bypasses RLS) |
| `REDIS_URL` | ✅ | Redis connection string (e.g. from Upstash) |
| `JWT_SECRET` | ✅ | Secret for signing agent tokens — generate with `openssl rand -hex 32` |
| `ADMIN_TOKEN` | ✅ | Password for the agent creation endpoint |
| `ALLOWED_DOMAINS` | ✅ | Comma-separated list of domains agents may call via `net_*` |
| `ENCRYPTION_KEY` | ✅ | Key for encrypting sensitive data at rest |
| `NODE_ENV` | ✅ | Set to `production` on Vercel |
| `STORAGE_QUOTA_GB` | ❌ | Default storage quota per agent (default: `1`) |
| `MEMORY_QUOTA_MB` | ❌ | Default Redis memory quota per agent (default: `100`) |
| `RATE_LIMIT_PER_MIN` | ❌ | Default rate limit per agent (default: `100`) |

---

## Deployment

### Deploy to Vercel (recommended)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/chrizzy-x/Agent-OS)

Or manually:
```bash
npm install -g vercel
vercel --prod
```

Set all environment variables in **Vercel → Project → Settings → Environment Variables** before deploying.

### Self-hosted

```bash
npm run build
npm start
```

Requires Node.js 20+.

---

## Documentation

| Doc | Description |
|-----|-------------|
| **[docs/overview.md](docs/overview.md)** | Product overview, use cases, architecture, and quick start guide |
| **[docs/api.md](docs/api.md)** | Full tool schemas, error codes, and request/response examples |
| **[docs/security.md](docs/security.md)** | Threat model and security controls |

---

## Development

```bash
npm run dev          # start local server on :3000
npm run build        # compile TypeScript
npm run lint         # type-check without emitting
npm test             # run all tests
npm run test:watch   # re-run tests on file change
npm run test:coverage # generate coverage report
```

---

## Project structure

```
Agent-OS/
├── src/
│   ├── index.ts                  # HTTP server + request router
│   ├── auth/
│   │   ├── agent-identity.ts     # JWT creation + verification
│   │   ├── agent-context.ts      # AsyncLocalStorage for request context
│   │   └── permissions.ts        # AgentContext type + default quotas
│   ├── primitives/
│   │   ├── mem.ts                # Memory primitive (Redis)
│   │   ├── fs.ts                 # Filesystem primitive (Supabase Storage)
│   │   ├── db.ts                 # Database primitive (PostgreSQL)
│   │   ├── net.ts                # Network primitive (fetch + SSRF guard)
│   │   ├── events.ts             # Events primitive (Redis pub/sub)
│   │   └── proc.ts               # Process primitive (sandbox + cron)
│   ├── runtime/
│   │   ├── audit.ts              # Audit logging with withAudit() wrapper
│   │   ├── resource-manager.ts   # Rate limits + quota enforcement
│   │   ├── sandbox.ts            # Sandboxed code execution
│   │   └── security.ts           # SSRF checks + path/SQL validation
│   ├── storage/
│   │   ├── redis.ts              # Redis client singleton
│   │   ├── supabase.ts           # Supabase client singleton
│   │   └── migrations/           # PostgreSQL migration SQL files
│   └── utils/
│       ├── errors.ts             # Typed error hierarchy
│       ├── metrics.ts            # Timing utilities
│       └── validation.ts         # Zod schemas + sanitization helpers
├── tests/
│   ├── setup.ts                  # Global mock setup
│   ├── unit/primitives/          # Unit tests for all 6 primitives
│   ├── integration/              # Auth + storage integration tests
│   └── e2e/                      # Full HTTP server end-to-end tests
├── docs/
│   ├── api.md                    # Complete tool reference
│   └── security.md               # Threat model + security controls
├── .github/workflows/
│   ├── ci.yml                    # Type check + build + audit on PRs
│   ├── deploy.yml                # Auto-deploy to Vercel on main
│   └── security-scan.yml         # Weekly CodeQL + secret scanning
└── vercel.json                   # Vercel deployment config
```

---

## Modes

AgentOS runs in two modes controlled by a single environment variable:

| Mode | Config | Description |
|---|---|---|
| **Standalone** (default) | `FFP_MODE=disabled` | Self-contained AgentOS — no external dependencies beyond Supabase + Redis |
| **FFP Router** | `FFP_MODE=enabled` | Connects to the Furge Fabric Protocol network; all operations are logged to FFP chains with optional consensus gates for critical calls |

See [FFP_INTEGRATION.md](./FFP_INTEGRATION.md) for the full setup guide.

---

## Author

Built and maintained by **riz**.

## License

MIT
