# Agent OS — Technical Overview

> Operating System Infrastructure for AI Agents · Version 1.0

---

## What is Agent OS?

Agent OS is cloud infrastructure designed specifically for AI agents. It provides six fundamental primitives that autonomous agents need to operate:

| Primitive | What it provides |
|-----------|-----------------|
| **fs** | Persistent file storage |
| **net** | HTTP/HTTPS network access |
| **proc** | Sandboxed code execution |
| **mem** | Fast key-value caching |
| **db** | SQL database access |
| **events** | Pub/sub messaging |

Instead of every AI agent developer building backend infrastructure from scratch, Agent OS offers this as a managed service through simple API calls. Developers focus on building intelligent agents — Agent OS handles all the underlying infrastructure complexity.

---

## The Problem

Building an autonomous AI agent requires significant infrastructure:

- Setting up cloud servers and databases
- Configuring storage systems
- Implementing code execution sandboxes
- Managing security and isolation
- Handling scaling and monitoring

This setup typically takes weeks of development time and requires ongoing DevOps expertise to maintain.

Agent OS provides all of this out of the box — production-ready in minutes.

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

---

## Security

Every agent operates in complete isolation. Security is enforced at multiple layers:

- **Filesystem** — each agent has a private namespace; cross-agent access is impossible
- **Database** — row-level security scopes all queries to the authenticated agent
- **Memory** — cache keys are automatically namespaced per agent
- **Process** — each execution runs in an isolated Docker container with no network access by default
- **SSRF protection** — blocks requests to private IP ranges and cloud metadata endpoints
- **Audit logging** — every operation logged with timestamp, agent ID, operation type, and result

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
