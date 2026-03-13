# AgentOS Security Model

This document describes the security controls in AgentOS and the threat model they protect against.

---

## Threat Model

AgentOS is designed to run code and access resources on behalf of AI agents. The primary threats are:

1. **Agent escaping its namespace** — reading/writing another agent's data
2. **SSRF (Server-Side Request Forgery)** — agents reaching internal cloud metadata or private networks
3. **SQL injection** — agents manipulating database queries to access unauthorized data
4. **Path traversal** — agents escaping their file storage namespace via `../` sequences
5. **Code execution abuse** — agents running malicious code that harms the host system
6. **Resource exhaustion** — agents consuming excessive CPU, memory, or storage
7. **Authentication bypass** — forged or stolen tokens granting unauthorized access

---

## Authentication

### JWT Tokens

Every agent is issued a signed JWT (RS256/HS256 via `jsonwebtoken`). Tokens contain:

- `sub` — the agent's stable identifier
- `allowedDomains` — explicit list of hostnames the agent may reach via the net primitive
- `quotas` — per-agent resource limits (storage, memory, rate)
- `exp` — expiration timestamp (default 30 days)

**Token validation on every request:**
1. Signature verified against `JWT_SECRET`
2. Expiration checked — expired tokens are rejected with `401`
3. `sub` claim must be non-empty
4. Decoded claims are never trusted from the request body — only from the verified JWT

**Admin token for agent creation:**
The `ADMIN_TOKEN` env var gates the `POST /admin/agents` endpoint. It must be a long random value (≥64 bytes of entropy). Never use the JWT secret as the admin token.

---

## Namespace Isolation

### Memory (Redis)

Every Redis key is prefixed with the agent's ID:
```
{prefix}:{agentId}:{userKey}
```

Agents cannot read or enumerate keys belonging to other agents because the prefix is derived from the verified JWT `sub` claim, not from user input.

### Filesystem (Supabase Storage)

Files are stored at paths: `{agentId}/{sanitizedPath}`

**Path sanitization (`sanitizePath`):**
- Converts backslashes to forward slashes
- Collapses double slashes
- Splits on `/` and rejects any component equal to `..`
- Strips leading slashes
- Returns only the normalized path components

Attempts to use `../../etc/passwd` or similar patterns throw `ValidationError` before any storage call is made.

### Database (PostgreSQL)

Each agent has a dedicated PostgreSQL schema named `agent_{agentId}` (special chars replaced with `_`). All queries execute with `SET search_path TO {agentSchema}, public`, so unqualified table names resolve to the agent's own schema.

**The `execute_agent_query` stored procedure:**
- Validates schema name matches `^agent_[a-zA-Z0-9_]+$`
- Blocks direct references to `pg_catalog`, `information_schema`, `pg_shadow`, `pg_authid`
- Accepts parameters as a JSON array — never interpolates user strings into SQL
- Runs as `SECURITY DEFINER` so it executes with elevated privileges but under strict validation

**DDL is restricted** — agents cannot run arbitrary `CREATE TABLE` via `db_query`. They must use `db_create_table`, which enforces column type allowlisting and builds the DDL server-side from validated inputs.

---

## SSRF Protection

The `checkSsrf` function (called before every outbound HTTP request and DNS resolution) defends against agents reaching internal services.

**DNS-based checks:**
1. Parse URL — reject non-HTTPS, malformed URLs
2. Block by exact hostname: `metadata.google.internal`, `metadata.internal`, `instance-data`
3. Resolve the hostname to all IP addresses (`dns.lookup` with `all: true`)
4. Check every resolved IP against blocked prefix list:
   - `10.*` — RFC1918 private
   - `172.16.* – 172.31.*` — RFC1918 private
   - `192.168.*` — RFC1918 private
   - `127.*` — loopback
   - `169.254.*` — link-local / AWS EC2 metadata (`169.254.169.254`)
   - `100.64.*` — shared address space (RFC 6598)
   - `::1` — IPv6 loopback
   - `fc00:` — IPv6 unique local
   - `fe80:` — IPv6 link-local

**Domain allowlist:**
After the IP check, the URL's hostname must match the agent's `allowedDomains` list (from the JWT) OR the global `ALLOWED_DOMAINS` environment variable. Exact match or subdomain match is accepted. If neither list has entries, all outbound requests are blocked (fail-safe default).

**Known limitation — DNS rebinding:**
The DNS check occurs before the actual fetch. A malicious DNS server could return a public IP during the check and a private IP during the actual connection (DNS rebinding). For production deployments handling adversarial agents, place an egress proxy (e.g., Squid with IP-based ACLs) between AgentOS and the internet, or use a DNS-pinning HTTP client.

---

## Code Execution Security

### Sandbox Design

`proc_execute` runs code in a subprocess with:
- An isolated temp directory (`mkdtemp`) as the working directory and `HOME`/`TMPDIR`
- A restricted `PATH` containing only `/usr/local/bin:/usr/bin:/bin`
- No inherited environment variables (no access to `JWT_SECRET`, `SUPABASE_URL`, Redis credentials, etc.)
- `stdin` closed (no interactive input)
- Stdout/stderr captured and size-capped at 1MB each
- A hard kill (`SIGKILL`) after the configured timeout

### What the sandbox does NOT prevent

- **Filesystem reads** — the process can read files on the host system that are world-readable. Vercel's serverless environment provides significant OS-level isolation, but on a self-hosted deployment, consider running in a container.
- **Network access** — the subprocess can make outbound network calls directly, bypassing the SSRF checks in the net primitive. The `ALLOWED_DOMAINS` restriction applies to the `net_*` tools, not to code running in `proc_execute`.
- **CPU exhaustion** — the timeout kills the process, but a process consuming 100% CPU for `timeout` ms is permitted.

**For high-security deployments:** Run AgentOS in a container with `seccomp` and `AppArmor` profiles that restrict syscalls. Alternatively, use Deno or a dedicated sandbox service (e.g., AWS Firecracker, gVisor) for `proc_execute`.

---

## Rate Limiting and Quotas

### Rate Limiting

A sliding-window counter in Redis limits each agent to N requests per minute (configurable, default 100). The counter key includes the current minute bucket:
```
rate:{agentId}:{YYYY-MM-DDTHH:MM}
```
The key is set with a 2-minute TTL. If the count exceeds the limit, `RateLimitError` is thrown before any operation is executed.

### Storage Quota

Before every `fs_write`, the resource manager sums all `size_bytes` for the agent's files in the `agent_files` table and checks `used + incoming > quota`. The default quota is 1GB. Exceeding it returns `429 QUOTA_EXCEEDED`.

### Memory Quota

A Redis counter key (`mem_usage:{agentId}:total`) tracks cumulative Redis memory usage for the agent. It is incremented on `mem_set` (delta from old value) and decremented on `mem_delete`. The default quota is 100MB.

---

## Input Validation

All tool inputs are validated with Zod schemas before reaching any business logic. The `validate()` utility converts Zod parse errors into `ValidationError` with a human-readable message listing all failing fields.

Key constraints:
- Redis keys: max 512 chars, alphanumeric + `_:.-/`
- File paths: max 1024 chars, validated against traversal
- SQL: max 100KB
- URLs: valid URL format, max 2048 chars
- Headers: record of strings (no nested objects)
- Code size: max 1MB

---

## Secrets Management

| Secret | Purpose | Minimum entropy |
|--------|---------|-----------------|
| `JWT_SECRET` | Signs and verifies agent tokens | 64 bytes |
| `ADMIN_TOKEN` | Gates agent provisioning endpoint | 32 bytes |
| `SUPABASE_SERVICE_KEY` | Supabase service role (bypasses RLS) | Issued by Supabase |
| `REDIS_URL` | Redis connection string (includes auth) | N/A |

**Never commit secrets to version control.** Use Vercel's encrypted environment variables for production. Rotate secrets immediately if compromised.

---

## Audit Logging

Every primitive operation — success or failure — is written to the `audit_logs` table in Supabase. Each record includes:
- `agent_id`, `primitive`, `operation`
- `success` (boolean)
- `duration_ms`
- `metadata` — sanitized input summary (no secrets, no full file contents)
- `error` — error message on failure

Audit writes are fire-and-forget (failures do not block operations) but are logged to stderr so Vercel captures them in function logs.

Audit logs are immutable — agents have no tools to delete or modify them. Row Level Security with `DENY ALL` policies prevents any direct client access.

---

## Dependency Security

Production dependencies are audited on every CI run (`npm audit --audit-level=high`). A weekly scheduled GitHub Actions workflow runs `npm audit` and CodeQL analysis. The `gitleaks` secret scanner runs on every push.

**Key production dependencies and their trust level:**

| Package | Purpose | Trust level |
|---------|---------|-------------|
| `jsonwebtoken` | JWT signing/verification | High — widely audited |
| `ioredis` | Redis client | High — actively maintained |
| `@supabase/supabase-js` | Storage and DB client | High — Supabase official |
| `zod` | Input validation | High — widely used |

---

## Security Reporting

To report a security vulnerability, please email the maintainer directly rather than opening a public GitHub issue. Do not publish exploits or proof-of-concept code before coordinating a fix.
