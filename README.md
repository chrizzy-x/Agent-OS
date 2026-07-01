# AgentOS

<p align="center">
  <img src="public/logo.png" alt="AgentOS logo" width="220" />
</p>

> V6.6.7

AgentOS is an AI operating system. Every user gets one Super AgentOS with shared Studio, projects, apps, skills, workflows, memory, Vault, workspace assets, and activity.

Live:
- [agentos.services](https://agentos.services)
- [Signup](https://www.agentos.services/signup)

Supporting message:
- talk to it, build with it, and install what it needs

## V6.6.7 status

V6.6.7 makes Super AgentOS the primary product surface. Apps, skills, workflows, subagents, MCP tools, Vault metadata, memory, projects, and Library assets are exposed as workspace capabilities behind one conversational interface.

See [Super AgentOS release notes](RELEASE_NOTES_v6.6.7.md).

## V6.6.4 status

V6.6.4 shipped the Marketplace & Capability Layer: App Store discovery, Skill Store capability registry, permanent ownership, device install separation, update center, developer profiles, skill dependencies, permission management, and workspace asset registry synchronization without redesigning Studio, Workspace, Library, Vault, Memory, or MCP.

## V6.6.3 status

V6.6.3 restores the persistent AgentOS operating-system shell, complete top-level navigation, workspace/session/project access, desktop sidebars, mobile drawers, mode-aware Studio context, structured composer tools, Community, and read-only FFP Coming Soon behavior without removing v6.6.2 streaming or execution functionality.

See [Navigation & Workspace Recovery release notes](RELEASE_NOTES_v6.6.3.md).

## V6.6.2 status

V6.6.2 ships:
- `/studio` as the primary Super AgentOS operating surface with persisted chat, streaming replies, execution cards, files, memory, apps, skills, workflows, MCP context, recovery, notifications, and panic stop controls
- unified persisted executions for Super AgentOS requests, app lifecycle actions, skill calls, workflow runs, file actions, memory actions, MCP-facing runtime paths, logs, failures, recovery state, duration, tokens, and estimated cost fields
- `/files` for governed upload, preview, summarize, rename, search, and delete flows
- Panic Button and Recovery Center for stopping active work, retrying, resuming, cancelling, rolling back, and inspecting failures
- notifications for completed tasks, failed tasks, approval requests, workflow completion, and execution status changes
- `/` and `/studio` as the locked Super AgentOS operating surface, with conversation-first NL Studio as the default view
- shared NL Studio, Workflow Studio, and Code Studio modes inside the Super AgentOS workspace
- rebuilt NL Studio chat layout with an empty-state prompt launcher, sticky responsive composer, Markdown/GFM replies, visible streaming status, stop control, and desktop/mobile conversation parity
- lazy chat creation so opening NL Studio starts clean without creating an empty persisted session
- real SSE response streaming with partial-output persistence, safe cancellation, chat-history reopen, cross-project session selection, and search-backed recent chats
- permissioned sharing and canonical `private|workspace|public` visibility across sessions, subagents, workflows, skills, memory, and governed file records
- current-chat search and permission-filtered cross-session chat search
- `/memory` for governed user, session, project, agent, workflow, app, and skill memory records with search, edit, delete, sharing, and export
- `/marketplace` as a lightweight discovery layer
- `/appstore` with consumer marketplace discovery, app install, open, update, uninstall, and pin flows
- `/skillstore` as the public Skill Store for installable capabilities
- `/skills` as the installed skills management surface
- `/publish/app` and `/publish/skill` as official publishing workflows
- `/appstore/[slug]` with listing media, readiness, permissions, secrets, skills, targets, health, offline package cache, and owner analytics
- `/agents` as the canonical private-agent runtime surface
- `/subagents` as an alias to the same private-agent runtime surface
- `/vault` with assignment-aware secret validation and runtime grants
- hardened Vault runtime injection with temporary secret access, runtime cleanup, access audit events, and shared output redaction
- `/mcp` with advanced tool discovery, connector diagnostics, and runtime execution visibility
- `/ffp` retained as disabled Coming Soon compatibility surface in V6.6.3
- `/settings?section=billing` with self-serve plan transitions across Free, Pro, Enterprise, and Enterprise Max
- SDK app registration into factual public listings when an Enterprise SDK app is explicitly registered
- global search across apps, skills, workflows, sessions, projects, agents, and Vault secret names only
- governed memory, governed files, and permission grants exposed through typed APIs and V6.6.2 SDK helpers
- in-Studio multi-agent discovery, creation, switching, and linked-session flow without leaving Studio
- keyword, full-text, fuzzy search, recent searches, and pinned results across first-party and MCP-facing resource types
- editable memory records in-product over the existing memory API
- session create, continue, rename, archive, delete, search, export, and persistence
- session create, rename, pin, archive, soft-delete, search, and persistence with server-backed ownership enforcement
- structured Studio intent outcomes for chat replies, previews, approvals, forbidden states, unsupported actions, and completed actions

Production verification:
- URL: [https://www.agentos.services](https://www.agentos.services)
- Deployment URL: [https://agent-7ilh0ftpw-prime-labs.vercel.app](https://agent-7ilh0ftpw-prime-labs.vercel.app)
- Deployment alias: [https://www.agentos.services](https://www.agentos.services)
- Final deploy date: June 22, 2026
- Quality gates: `npm run lint`, 382 unit/integration tests, `npm run build`, and Playwright desktop/tablet/mobile OS acceptance passed before final deployment
- Screenshot artifacts: `agentos-artifacts/v666-qa/`
- Migrations: apply `src/storage/migrations/026_v651_unified_execution_release.sql`, `src/storage/migrations/027_v652_product_alignment.sql`, and `src/storage/migrations/028_v661_production_closure.sql` for unified executions, logs, notifications, Library, runtime controls, action audit metadata, and recovery fields
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
- Free (`retail_free`)
- Pro (`retail_pro`)
- Enterprise (`enterprise_plus`)
- Enterprise Max (`enterprise_max`)

Self-serve plan transitions are live in free beta mode:
- `POST /api/plans/transition`
- `/settings?section=billing`

## FFP

FFP is visible at `/ffp`.

Behavior:
- `/api/ffp/temp` exposes the workspace FFP temp status
- `PATCH /api/ffp/temp` enables or disables the temporary routing abstraction
- disabled routes multi-agent activities directly to the Unified Execution Engine
- enabled routes multi-agent workflows, subagent collaboration, and multi-agent delegation through the FFP temporary abstraction before the Unified Execution Engine
- single-agent execution bypasses FFP temp

Environment:
```env
FFP_TEMP_ENABLED=false
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
- FFP temp settings

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
- `FFP_TEMP_ENABLED` is optional; the workspace toggle is the source of truth

## Development

```bash
npm run dev
npm run dev:api
npm run lint
npm test
npm run build
```

NL Studio behavior and route details are documented in [docs/studio.md](docs/studio.md).

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
vercel deploy --prod -y
```

Before deploying:
- keep `main` fast-forwarded with `origin/main`
- confirm `.vercel/project.json` points at the intended project
- verify `/`, `/studio`, `/appstore`, `/appstore/[slug]`, `/skillstore`, `/skills`, `/skills/[slug]`, `/apps`, `/publish/app`, `/publish/skill`, `/files`, `/memory`, `/workflows`, `/agents`, `/vault`, `/search`, `/ffp`, `/mcp`, `/developer`, `/developer/[handle]`, `/sdk`, `/settings?section=billing`, and redirect aliases for `/workspace`, `/workspaces`, `/dashboard`, `/profile`, `/billing`, and `/developer/publish`
- after production deployment, update release notes with the production URL, deployment alias, screenshot artifacts, migration status, and quality-gate result

## Project layout

```text
app/                  Next.js routes and pages
components/           UI and page components
src/appstore/         app catalog, lifecycle, SDK recovery
src/vault/            vault assignment, grants, redaction
src/studio/           sessions, snapshots, persistence
src/ffp/              FFP temp routing settings
src/storage/          Supabase, Redis, local state, migrations
tests/                unit, integration, and e2e coverage
```

## License

MIT
