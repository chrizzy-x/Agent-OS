# FFP Integration Guide

AgentOS supports an optional **Furge Fabric Protocol (FFP)** mode that routes all
primitive operations through a decentralised consensus network. When disabled
(the default) there is zero performance overhead and no FFP dependency.

---

## How it works

```
FFP_MODE=disabled (default)          FFP_MODE=enabled
────────────────────────────         ─────────────────────────────────────
Client → AgentOS primitives          Client → AgentOS primitives
         ↓                                    ↓              ↓
         Execute                              Execute   FFP chain log
         ↓                                    ↓
         Return result                        Return result
                                              (+ optional consensus gate)
```

### Logging
After every successful primitive call, a structured record is submitted to the
configured FFP chain. The call is **fire-and-forget** — a log failure never
blocks the primary operation.

### Consensus gates
When `FFP_REQUIRE_CONSENSUS=true`, outbound HTTP calls to critical financial
domains (Binance, Coinbase, Stripe, etc.) are held until the FFP network
returns an approval. Unapproved calls are rejected with a `400 VALIDATION_ERROR`.

---

## Setup

### 1. Environment variables

| Variable | Required for FFP | Description |
|---|---|---|
| `FFP_MODE` | ✅ | Set to `enabled` to activate |
| `FFP_CHAIN_ID` | ✅ | Chain identifier, e.g. `finance-chain` |
| `FFP_NODE_URL` | ✅ | Base URL of your FFP node, e.g. `https://node.ffp.example.io` |
| `FFP_AGENT_ID` | ✅ | Cryptographic identity for this AgentOS instance |
| `FFP_REQUIRE_CONSENSUS` | ❌ | `true` to enforce consensus on critical ops (default `false`) |

### 2. Vercel

Add the FFP variables to your Vercel project under **Settings → Environment Variables**.
No code changes needed — the rest is configuration.

```json
{
  "env": {
    "FFP_MODE": "enabled",
    "FFP_CHAIN_ID": "finance-chain",
    "FFP_NODE_URL": "https://node.ffp.example.io",
    "FFP_AGENT_ID": "agent-os-prod-001",
    "FFP_REQUIRE_CONSENSUS": "true"
  }
}
```

---

## API endpoints

### `GET /ffp/status`
Returns current FFP configuration (no secrets). Always available regardless of mode.

```json
{
  "enabled": true,
  "chainId": "finance-chain",
  "nodeUrl": "https://node.ffp.example.io",
  "requireConsensus": true
}
```

### `GET /ffp/audit/:agentId`
Query the FFP chain for all operations logged by a specific agent.
Requires `Authorization: Bearer <ADMIN_TOKEN>`.

Query params:
- `chain_id` — filter by chain (optional)
- `start_time` — Unix ms start (optional)
- `end_time` — Unix ms end (optional)

```json
{
  "agentId": "my-agent",
  "operations": [
    {
      "primitive": "net",
      "action": "http_post",
      "params": { "url": "https://api.stripe.com/v1/charges" },
      "result": { "status": 200 },
      "timestamp": 1718000000000,
      "agentId": "my-agent"
    }
  ],
  "total": 1
}
```

### `GET /ffp/consensus/:agentId`
Query consensus proposal history for a specific agent.
Requires `Authorization: Bearer <ADMIN_TOKEN>`.

---

## Primitives covered

| Primitive | Operations logged | Consensus gate |
|---|---|---|
| `mem` | set, get, delete, incr, expire | — |
| `fs` | write, read, list, delete | — |
| `db` | query, transaction, create_table, insert, update, delete | — |
| `net` | http_get, http_post, http_put, http_delete | ✅ critical domains |
| `events` | publish, subscribe, unsubscribe | — |
| `proc` | execute, schedule, spawn | — |

**Critical domains** (trigger consensus when `FFP_REQUIRE_CONSENSUS=true`):
`binance.com`, `coinbase.com`, `kraken.com`, `stripe.com`, `paypal.com`, `braintreepayments.com`

---

## Backward compatibility

Setting `FFP_MODE=disabled` (or omitting it entirely) leaves all FFP code
completely dormant. All existing tests pass unchanged. Existing deployments
require no migration.
