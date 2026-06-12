# AgentOS

<p align="center">
  <img src="public/logo.png" alt="AgentOS logo" width="220" />
</p>

> v6.5.1

AgentOS is an AI operating system. Every user gets one Super AgentOS with shared Studio, projects, apps, skills, workflows, memory, Vault, and activity.

Live:
- [agentos.services](https://agentos.services)
- [Signup](https://www.agentos.services/signup)

Supporting message:
- talk to it, build with it, and install what it needs

## V6.5.1 status

V6.5.1 ships:
- `/studio` as the primary Super AgentOS operating surface with persisted chat, streaming replies, execution cards, files, memory, apps, skills, workflows, MCP context, recovery, notifications, and panic stop controls
- unified persisted executions for Super AgentOS requests, app lifecycle actions, skill calls, workflow runs, file actions, memory actions, MCP-facing runtime paths, logs, failures, recovery state, duration, tokens, and estimated cost fields
- `/files` for governed upload, preview, summarize, rename, search, and delete flows
- Panic Button and Recovery Center for stopping active work, retrying, resuming, cancelling, rolling back, and inspecting failures
- notifications for completed tasks, failed tasks, approval requests, workflow completion, and execution status changes
- `/` as Super AgentOS Home with recent chats, installed apps, installed skills, workflows, activity, and quick actions
- shared NL Studio and Code Studio modes inside the Super AgentOS workspace
- permissioned sharing and canonical `private|workspace|public` visibility across sessions, subagents, workflows, skills, memory, and governed file records
- current-chat search and permission-filtered cross-session chat search
- `/memory` for governed user, session, project, agent, workflow, app, and skill memory records with search, edit, delete, sharing, and export
- `/marketplace` as a lightweight discovery layer
- `/appstore` with real app install, open, update, uninstall, and pin flows
- `/skills` as the public Skill Store for installable capabilities
- `/appstore/[slug]` with readiness, permissions, secrets, skills, targets, health, and owner analytics
- `/agents` as the canonical private-agent runtime surface
- `/subagents` as an alias to the same private-agent runtime surface
- `/vault` with assignment-aware secret validation and runtime grants
- hardened Vault runtime injection with temporary secret access, runtime cleanup, access audit events, and shared output redaction
- `/mcp` with advanced tool discovery, connector diagnostics, and runtime execution visibility
- `/ffp` with runtime status, chains, audit history, consensus history, related workflows, and related apps
- `/billing` with free-beta self-serve plan transitions across Retail Free, Retail Pro, Enterprise Plus, and Enterprise Max
- SDK app auto-discovery and legacy `kernel_registry` recovery into factual public listings
- global search across apps, skills, workflows, sessions, projects, agents, and Vault secret names only
- governed memory, governed files, and permission grants exposed through typed APIs and V6.5.1 SDK helpers
- in-Studio multi-agent discovery, creation, switching, and linked-session flow without leaving Studio
- keyword, full-text, fuzzy search, recent searches, and pinned results across first-party and MCP-facing resource types
- editable memory records in-product over the existing memory API
- session branching with parent lineage and isolated branch messages and events
- session create, rename, pin, archive, soft-delete, search, and persistence with server-backed ownership enforcement
- structured Studio intent outcomes for chat replies, previews, approvals, forbidden states, unsupported actions, and completed actions

Production verification:
- URL: [https://www.agentos.services](https://www.agentos.services)
- Deployment alias: [https://www.agentos.services](https://www.agentos.services)
- Final deploy date: June 12, 2026
- `GET /health`: `200`, `version: 6.5.1`, `tools: 44`
- Quality gates: `npm run lint`, `npm test`, and `npm run build` passed before final deployment
- Migration: apply `src/storage/migrations/026_v651_unified_execution_release.sql` for session pin/archive/delete timestamps plus unified executions, logs, and notifications
- browser session refresh and expired-session handling across protected routes
- enterprise-only SDK, developer, and publishing shells with signed-out and blocked states

Rules enforced in shipped surfaces:
- no fake marketplace data
- no placeholder production apps
- no secret values in frontend responses, workflow state, Studio messages, logs, or events
- no generic production skill execution fallback

## App lifecycle

Key routes:
- `GET /api/apps`
- `GET /api/apps/[slug]`
- `GET /api/apps/[slug]/readiness`
- `POST /api/apps/install`
- `GET /api/apps/installed`
- `POST /api/apps/[slug]/open`
- `PATCH /api/apps/[slug]/installation`
- `DELETE /api/apps/[slug]/installation`
- `GET /api/apps/[slug]/download`
- `GET /api/executions`
- `GET /api/executions/[id]`
- `POST /api/executions/[id]/actions`
- `GET /api/recovery`
- `POST /api/recovery`
- `POST /api/panic`
- `GET /api/notifications`
- `POST /api/notifications`

Readiness returns:
- current installation
- required permissions
- missing permissions
- missing secrets
- missing skills
- `ready`
- `updateAvailable`
- resolved targets for `web`, `android`, and `ios`

Open flow rules:
- `web` increments web opens
- `android` increments Android opens
- `ios` increments iOS opens
- stale installs are blocked with typed errors

## Vault runtime injection

Vault runtime access is grant-based.

Routes:
- `POST /api/vault/access`
- `POST /api/vault/runtime-grants/consume`

Behavior:
- validates secret status and assignment
- validates app permission scope for app-backed runtime access
- stores ephemeral runtime grants without storing plaintext secret values
- supports consume and cleanup
- audits granted and denied access
- redacts secret-like values from Studio persistence and workflow state

The runtime consume route is SDK-kernel only. Secret values are never returned to browser-facing routes.

## Plans

Public beta plans:
- `retail_free`
- `retail_pro`
- `enterprise_plus`
- `enterprise_max`

Self-serve plan transitions are live in free beta mode:
- `POST /api/plans/transition`
- `/billing`

## FFP

FFP is visible at `/ffp`.

Behavior:
- signed-in retail users see the module with a locked enterprise state
- enterprise workspaces see status, chains, audit history, consensus history, related workflows, related apps, and logs
- `/ffp/status` exposes runtime mode, chain id, node url, and consensus requirement
- `/api/ffp/chains` exposes public chain discovery stats
- `/api/agent/ffp/audit` and `/api/agent/ffp/consensus` are authenticated agent-scoped routes

Environment:
```env
FFP_MODE=enabled
FFP_CHAIN_ID=your-chain-id
FFP_NODE_URL=https://your-ffp-node.example.com
FFP_REQUIRE_CONSENSUS=false
```

## Search

`/search` is backed by real server data. It searches:
- apps
- skills
- workflows
- sessions
- projects
- subagents
- Vault secret names
- files
- docs
- connectors
- FFP records

It never returns Vault secret values.

## Quickstart

```bash
git clone https://github.com/chrizzy-x/Agent-OS.git
cd Agent-OS
npm install
cp .env.example .env
npm run dev
```

Required environment:

```env
NEXT_PUBLIC_APP_URL=https://www.agentos.services
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
REDIS_URL=
JWT_SECRET=
ADMIN_TOKEN=
ENCRYPTION_KEY=
VAULT_ENCRYPTION_KEY=
ANTHROPIC_API_KEY=
```

Notes:
- `VAULT_ENCRYPTION_KEY` falls back to `ENCRYPTION_KEY`
- `FFP_*` values are optional unless FFP is enabled

## Development

```bash
npm run dev
npm run dev:api
npm run lint
npm test
npm run build
```

## Deployment

Quality gate:

```bash
npm run lint
npm test
npm run build
```

Production deploy:

```bash
vercel pull
vercel deploy --prod
```

Before deploying:
- keep `main` fast-forwarded with `origin/main`
- confirm `.vercel/project.json` points at the intended project
- verify `/`, `/studio`, `/appstore`, `/appstore/[slug]`, `/skills`, `/skills/[slug]`, `/files`, `/memory`, `/workflows`, `/agents`, `/vault`, `/search`, `/ffp`, `/mcp`, `/developer`, `/sdk`, and redirect aliases for `/workspace`, `/workspaces`, and `/dashboard`
- after production deployment, update release notes with the production URL, live browser verification result, migration status, and GitHub release URL

## Project layout

```text
app/                  Next.js routes and pages
components/           UI and page components
src/appstore/         app catalog, lifecycle, SDK recovery
src/vault/            vault assignment, grants, redaction
src/studio/           sessions, snapshots, branching
src/ffp/              FFP client and verification
src/storage/          Supabase, Redis, local state, migrations
tests/                unit, integration, and e2e coverage
```

## License

MIT
