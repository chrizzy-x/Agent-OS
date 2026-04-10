# AgentOS

> Built by **riz** · v5 "Ares"

**OS-level primitives for AI agents — memory, files, databases, networking, events, and code execution over a single authenticated HTTP API.**

🚀 **Live:** [agentos-app.vercel.app](https://agentos-app.vercel.app) · [Get started free →](https://agentos-app.vercel.app/signup)

AgentOS is a production infrastructure layer that gives any agent or app a safe, isolated environment to persist data, run code, make HTTP requests, publish events, and coordinate with other agents — without touching the host system. Each client gets its own namespace, enforced quotas, rate limits, and a full audit trail.

---

## What's inside

### 6 Core Primitives

| Primitive | What it does | Backed by |
|-----------|-------------|-----------|
| **mem** | Key-value cache with TTL (set, get, list, increment, expire) | Redis |
| **fs** | File read/write/list/delete/stat — isolated per agent | Supabase Storage |
| **db** | Private SQL database — create tables, query, insert, update, delete | PostgreSQL |
| **net** | Outbound HTTP + DNS resolution with SSRF protection | Node.js fetch |
| **events** | Pub/sub messaging between agents via Redis topics | Redis |
| **proc** | Sandboxed code execution (Python, JS, Bash) + cron scheduling | Sandboxed subprocess |

### Skills Marketplace
Install pre-built capabilities from the marketplace. Developers earn 70% revenue share.

### Universal MCP Router
One endpoint routes to built-in primitives, installed skills, or any external MCP server (Gmail, Slack, GitHub, etc.).

| Source | Tool format | Example |
|--------|-------------|---------|
| Primitives | `agentos.{tool}` | `agentos.net_http_get` |
| Skills | `agentos.skill.{slug}.{capability}` | `agentos.skill.pdf-reader.extract_text` |
| External MCP | `mcp.{server}.{tool}` | `mcp.gmail.send_email` |

### FFP (Furge Fabric Protocol)
Every agent operation can be logged to an immutable audit chain. Sensitive operations can require multi-party consensus before executing. View your audit trail and consensus history directly in the dashboard under the FFP tab.

### Studio v4 — Natural Language Workflows
Describe what you want in plain English. Claude maps it to primitives, returns a step-by-step plan, you confirm, it executes and saves as a reusable workflow.

```
POST /api/studio/intent
{ "instruction": "Fetch ETH price every minute and store in memory" }
→ returns plan with steps + confirmToken
→ POST with { "confirm": true, "confirmToken": "..." } to execute
```

### SDK Kernel Command Layer
SDK products (Mezzy, Derek, deZypher) register a command topic and status topic. AgentOS routes commands through the Redis events bus.

```
POST /api/kernel/register   # register your product
POST /api/kernel/command    # dispatch a command
GET  /api/kernel/status/:product  # heartbeat + available commands
```

---

## Quickstart

### Option A: Hosted

[Sign up at agentos-app.vercel.app/signup](https://agentos-app.vercel.app/signup) — get your Agent ID and API key in 30 seconds. No credit card required.

```bash
# Store a value
curl -X POST https://agentos-app.vercel.app/mcp \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tool":"agentos.mem_set","input":{"key":"hello","value":"world","ttl":3600}}'

# Fetch live data
curl -X POST https://agentos-app.vercel.app/mcp \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tool":"agentos.net_http_get","input":{"url":"https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"}}'
```

### Option B: Self-host

```bash
git clone https://github.com/chrizzy-x/Agent-OS.git
cd Agent-OS
npm install
cp .env.example .env
npm run dev
```

Required env vars:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
REDIS_URL=
JWT_SECRET=
ENCRYPTION_KEY=
ADMIN_TOKEN=
ANTHROPIC_API_KEY=        # required for Studio NL mode
NEXT_PUBLIC_APP_URL=
```

---

## Dashboard Access for SDK Users

SDK users access the full dashboard (FFP audit trail, consensus, workflows) using their API key:

```js
const res = await fetch('https://agentos-app.vercel.app/api/session/from-key', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ apiKey: process.env.AGENT_OS_KEY }),
});
const { loginUrl } = await res.json();
// Open loginUrl in browser — full dashboard, expires in 5 minutes
```

---

## API Reference

All tool calls:

```
POST /mcp
Authorization: Bearer <api_key>
{ "tool": "agentos.{tool_name}", "input": { ... } }
```

### mem
| Tool | Input | Returns |
|------|-------|---------|
| `mem_set` | `key, value, ttl?` | `true` |
| `mem_get` | `key` | value or null |
| `mem_delete` | `key` | `true` |
| `mem_list` | `prefix?` | string[] |
| `mem_incr` | `key, by?` | new value |

### fs
| Tool | Input | Returns |
|------|-------|---------|
| `fs_write` | `path, data (base64)` | `true` |
| `fs_read` | `path` | base64 data |
| `fs_list` | `path?` | file list |
| `fs_delete` | `path` | `true` |
| `fs_mkdir` | `path` | `true` |

### db
| Tool | Input | Returns |
|------|-------|---------|
| `db_query` | `sql, params?` | rows[] |
| `db_insert` | `table, data` | inserted row |
| `db_update` | `table, data, where` | updated rows |
| `db_delete` | `table, where` | deleted count |
| `db_create_table` | `table, schema[]` | `true` |

### net
| Tool | Input | Returns |
|------|-------|---------|
| `net_http_get` | `url, headers?` | `{ status, body }` |
| `net_http_post` | `url, body, headers?` | `{ status, body }` |
| `net_http_put` | `url, body, headers?` | `{ status, body }` |
| `net_http_delete` | `url, headers?` | `{ status, body }` |
| `net_dns_resolve` | `hostname` | IP addresses |

### events
| Tool | Input | Returns |
|------|-------|---------|
| `events_publish` | `topic, payload` | `true` |
| `events_subscribe` | `topic, limit?` | events[] |
| `events_list_topics` | — | topic names |

### proc
| Tool | Input | Returns |
|------|-------|---------|
| `proc_execute` | `language, code, timeout?` | `{ stdout, stderr, exitCode }` |
| `proc_schedule` | `cron, tool, input` | schedule ID |

---

## Workflow Library API

```
GET    /api/agent/workflows           # list all saved workflows
POST   /api/agent/workflows           # create manually
PATCH  /api/agent/workflows/:id       # pause / resume / update schedule
DELETE /api/agent/workflows/:id       # delete
```

---

## Architecture

```
Client (any language) → POST /mcp  { "tool": "...", "input": {} }
                           │
                           ├── JWT verification
                           ├── Rate limit check (Redis)
                           ├── Quota enforcement
                           │
                           ├── agentos.*        → 6 primitives
                           ├── agentos.skill.*  → skills marketplace
                           └── mcp.*            → external MCP servers
                                    │
                                    └── Audit log → Supabase (async)
                                    └── FFP chain → optional consensus gate
```

---

## Development

```bash
npm run dev           # Next.js on :3000
npm run dev:api       # API server via tsx
npm run build         # production build
npm run lint          # TypeScript type check
npm test              # run all tests
npm run test:watch    # watch mode
npm run test:coverage # coverage report
```

---

## Project structure

```
Agent-OS/
├── app/                          # Next.js app router pages + API routes
│   ├── api/
│   │   ├── studio/intent/        # NL intent parser (v4 Hermes)
│   │   ├── agent/workflows/      # Workflow library CRUD
│   │   ├── agent/ffp/            # FFP audit + consensus (agent-scoped)
│   │   ├── kernel/               # SDK kernel command layer
│   │   ├── session/from-key/     # SDK → dashboard login link
│   │   ├── payments/             # Crypto payments (Solana + Base USDC)
│   │   ├── skills/               # Marketplace routes
│   │   └── mcp/                  # Universal MCP router
│   ├── studio/                   # Studio UI (NL + Advanced modes)
│   ├── dashboard/                # Dashboard (Skills, FFP, Activity tabs)
│   ├── marketplace/              # Skills marketplace
│   └── docs/                     # Documentation pages
├── src/
│   ├── auth/                     # JWT, session cookies, permissions
│   ├── ffp/                      # Furge Fabric Protocol client
│   ├── mcp/                      # Universal MCP router + registry
│   ├── primitives/               # 6 core primitives
│   ├── skills/                   # Skill execution engine
│   ├── storage/                  # Redis + Supabase singletons
│   └── utils/                    # Errors, validation, metrics
└── tests/                        # Unit, integration, e2e tests
```

---

## Modes

| Mode | Config | Description |
|------|--------|-------------|
| **Standalone** (default) | `FFP_MODE=disabled` | No external dependencies beyond Supabase + Redis |
| **FFP Router** | `FFP_MODE=enabled` | Logs to FFP audit chains with optional consensus gates |

---

## Author

Built and maintained by **riz**.

## License

MIT
