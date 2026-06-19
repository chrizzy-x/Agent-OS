# AgentOS V6.6.3 Technical Overview

V6.6.3 mounts one persistent application shell around product and documentation routes. The shell owns workspace, project, session, navigation, responsive sidebars, context, and interaction telemetry while Studio remains one stateful module inside the operating system.

> Super AgentOS-first AI operating system for users, builders, apps, skills, workflows, MCP tools, files, memory, and persisted execution.

---

## What is AgentOS?

AgentOS is a consumer-facing AI operating system with Super AgentOS as the primary experience. A normal user can ask Super AgentOS to research, analyze, build, summarize files, create workflows, run apps, execute skills, call MCP tools, and recover failed work without manually navigating platform internals.

Builders still get the underlying operating system: apps, skills, workflows, SDK, MCP, files, memory, Vault, audit, and primitives.

V6.6.2 unifies those layers through persisted executions, recovery, panic stop, notifications, governed files, governed memory, workspace Library ownership, bearer-token connectivity, offline-capable app package cache, and production diagnostic errors.

AgentOS also provides six fundamental primitives that autonomous agents need to operate:

| Primitive | What it provides |
|-----------|-----------------|
| **fs** | Persistent file storage |
| **net** | HTTP/HTTPS network access |
| **proc** | Sandboxed code execution |
| **mem** | Fast key-value caching |
| **db** | SQL database access |
| **events** | Pub/sub messaging |

Instead of every user or developer assembling apps, skills, workflows, MCPs, memory, and runtime logs by hand, Super AgentOS orchestrates the route and records what happened.

---

## V6.6.2 Product Layers

| Layer | What it provides |
|-------|------------------|
| **Super AgentOS** | Conversation-first NL Studio with real SSE streaming, Markdown/GFM replies, stop/cancel, lazy chat creation, persisted history, search, files, memory, approvals, and automatic routing |
| **Execution** | Persisted runs for Super AgentOS, apps, skills, workflows, MCP, files, memory, primitives, logs, failures, cost, and recovery state |
| **Recovery** | Panic stop, pause/resume/retry/cancel/rollback, failure inspection, and notifications |
| **Files** | Upload, delete, rename, preview, summarize, search, and permission-aware access |
| **Memory** | User, session, project, agent, workflow, app, and skill memory with CRUD, search, export, and grants |
| **Builder** | AppStore, Skills, Workflows, SDK, MCP, Vault, FFP, Developer, and Audit surfaces |

---

## The Problem

Building an autonomous AI agent requires significant infrastructure:

- Setting up cloud servers and databases
- Configuring storage systems
- Implementing code execution sandboxes
- Managing security and isolation
- Handling scaling and monitoring

This setup typically takes weeks of development time and requires ongoing DevOps expertise to maintain.

Agent OS provides all of this out of the box - production-ready in minutes.

---

## Core Primitives

### Filesystem (`fs`)

Cloud-based file storage for agents. Each agent gets isolated storage for configurations, cached data, logs, and working files.

| Method | Description |
|--------|-------------|
| `fs.write(path, data)` | Save files |
| `fs.read(path)` | Load files |
| `fs.list(path)` | List directory contents |
| `fs.delete(path)` | Remove files |
| `fs.mkdir(path)` | Create directories |

**Use cases:** Strategy configurations, downloaded datasets, log files, cached API responses, intermediate processing results.

---

### Network (`net`)

Secure HTTP/HTTPS access for agents to interact with external APIs and services.

| Method | Description |
|--------|-------------|
| `net.http_get(url, headers)` | GET requests |
| `net.http_post(url, body, headers)` | POST requests |
| `net.http_put(url, body, headers)` | PUT requests |
| `net.http_delete(url, headers)` | DELETE requests |

**Use cases:** Fetching real-time data, calling third-party APIs, sending notifications, web scraping, webhook interactions.

---

### Process (`proc`)

Sandboxed code execution environment for running Python, JavaScript, and other languages securely.

| Method | Description |
|--------|-------------|
| `proc.execute(code, language, timeout)` | Run code |
| `proc.schedule(code, cron)` | Schedule recurring execution |
| `proc.spawn(config)` | Create sub-agents |
| `proc.kill(process_id)` | Terminate processes |

**Use cases:** Data analysis scripts, model inference, image processing, document transformation, scheduled tasks.

---

### Memory (`mem`)

High-speed key-value cache for temporary data with configurable expiration.

| Method | Description |
|--------|-------------|
| `mem.set(key, value, ttl)` | Store with expiration |
| `mem.get(key)` | Retrieve values |
| `mem.delete(key)` | Remove entries |
| `mem.incr(key)` | Atomic increment |
| `mem.list(prefix)` | List matching keys |

**Use cases:** API response caching, rate limiting, session management, temporary state, performance optimization.

---

### Database (`db`)

PostgreSQL database access for structured data storage and complex queries.

| Method | Description |
|--------|-------------|
| `db.query(sql, params)` | Execute SQL |
| `db.transaction(queries)` | Atomic transactions |
| `db.insert(table, data)` | Insert rows |
| `db.update(table, data, where)` | Update rows |
| `db.delete(table, where)` | Delete rows |

**Use cases:** Transaction logs, historical data, relationship mapping, analytics, audit trails.

---

### Events (`events`)

Publish-subscribe messaging for inter-agent communication and event-driven workflows.

| Method | Description |
|--------|-------------|
| `events.publish(topic, message)` | Send events |
| `events.subscribe(topic, callback)` | Listen for events |
| `events.unsubscribe(topic)` | Stop listening |

**Use cases:** Multi-agent coordination, workflow triggers, real-time notifications, pipeline orchestration.

---

## Architecture

Agent OS is built on modern cloud infrastructure with global distribution and automatic scaling.

```
Agent App / Service
        │  Authorization: Bearer <jwt>
        ▼
   API Gateway (Edge — nearest location)
        │
        ├── JWT auth validation
        ├── Rate limit check
        │
        ├── fs_*      → Supabase Storage
        ├── net_*     → fetch() + SSRF protection
        ├── proc_*    → Docker sandbox
        ├── mem_*     → Redis cluster
        ├── db_*      → Managed PostgreSQL
        └── events_*  → Redis pub/sub
               │
               └── Audit log (async)
```

**Performance targets:**

| Metric | Target |
|--------|--------|
| API latency (median) | < 50ms |
| API latency (p99) | < 200ms |
| Uptime SLA | 99.9% |
| Storage | Unlimited per agent |

## NL Studio

NL Studio is the default `/studio` mode. It opens as a clean draft instead of creating an empty database session. The first submitted message creates the chat, persists the user turn, streams the assistant response over SSE, and stores the completed or partial assistant output.

The current interface includes:

- prompt suggestions for new chats
- a responsive sticky composer
- Markdown and GitHub-flavored Markdown rendering
- live generation status and stop control
- safe cancellation that waits for the stream to settle
- persisted recent chats and cross-chat search
- session reopening across project boundaries
- separate NL Studio, Workflow Studio, and Code Studio modes

See [studio.md](./studio.md) for route contracts and UI behavior.

---

## Security

Every agent operates in complete isolation. Security is enforced at multiple layers:

- **Filesystem** — each agent has a private namespace; cross-agent access is impossible
- **Database** — row-level security scopes all queries to the authenticated agent
- **Memory** — cache keys are automatically namespaced per agent
- **Process** — each execution runs in an isolated Docker container with no network access by default
- **SSRF protection** — blocks requests to private IP ranges and cloud metadata endpoints
- **Audit logging** — every operation logged with timestamp, private agent reference, operation type, and result

See [security.md](./security.md) for the full threat model and controls.

---

## Developer Quick Start

```bash
# 1. Clone and install
git clone https://github.com/chrizzy-x/Agent-OS.git
cd Agent-OS
npm install

# 2. Configure environment
cp .env.example .env
# Fill in SUPABASE_URL, REDIS_URL, JWT_SECRET, ADMIN_TOKEN, etc.

# 3. Run database migrations (Supabase SQL Editor)
# src/storage/migrations/001_initial.sql
# src/storage/migrations/002_agent_db_functions.sql
# src/storage/migrations/003_scheduled_task_runner.sql

# 4. Start the server
npm run dev
```

### Example: Trading Agent Workflow

```
1. Fetch current price       → net.http_get()
2. Cache the price (60s)     → mem.set()
3. Load trading strategy     → fs.read()
4. Run analysis code         → proc.execute()
5. Execute trade signal      → net.http_post()
6. Log transaction           → db.insert()
7. Notify other agents       → events.publish()
```

---

## Use Cases

| Domain | How Agent OS helps |
|--------|--------------------|
| **Trading & Finance** | 24/7 market monitoring, trade execution, transaction history via db + net + proc |
| **Research & Data** | Academic paper indexing, multi-agent research teams via fs + db + events |
| **Customer Service** | Ticket classification, auto-response, escalation workflows via db + mem + events |
| **Data Pipelines** | ETL workflows with events triggering each stage via all six primitives |
| **Monitoring & Alerts** | Metric collection, threshold alerts, notification distribution via net + db + events |
| **Content Generation** | Trend research, article generation, scheduled publishing via net + proc + db + fs |
| **Multi-Agent Systems** | Coordinator + specialist agent architectures sharing state via db + mem + events |

---

## API Reference

Full tool schemas, error codes, and request/response examples: **[api.md](./api.md)**

### Authentication

```
Authorization: Bearer <your-api-key>
```

### Rate limit headers

```
X-RateLimit-Limit: <max requests per window>
X-RateLimit-Remaining: <requests remaining>
X-RateLimit-Reset: <reset timestamp>
```

### HTTP status codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not found |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

---

## Best Practices

- **Cache aggressively** — use `mem.set()` to cache expensive API calls and reduce latency and cost
- **Handle errors gracefully** — all primitives can fail; implement retry logic
- **Use transactions** — for multi-row database updates that must succeed atomically, use `db.transaction()`
- **Set appropriate TTLs** — prevent stale data by expiring cache entries at sensible intervals
- **Monitor usage** — track API calls, storage, and compute time to stay within plan limits

---

## Getting Started

1. Review this documentation
2. Sign up for an account
3. Install the SDK
4. Build your first agent
5. Deploy to production

For technical support, API reference, and community resources, visit the [Agent OS developer portal](https://github.com/chrizzy-x/Agent-OS).

---

## FFP Temp

FFP is disabled in V6.6.3. The route and compatibility records remain visible as a future wiring point for Fabric Furge Protocol.

| State | Route |
|-------|-------|
| **FFP Disabled** | Multi-agent activities -> Unified Execution Engine |
| **FFP Enabled** | Multi-agent activities -> FFP temporary abstraction layer -> Unified Execution Engine |

All execution bypasses FFP in V6.6.3. No consensus engine, proposal voting, activation control, or fake consensus result is exposed.
