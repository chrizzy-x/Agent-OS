# AgentOS

<p align="center">
  <img src="public/logo.png" alt="AgentOS logo" width="220" />
</p>

> v6.1

AgentOS is a production runtime for agents, apps, and workflows. It ships Studio, a real Skill Store, a real App Store, Vault-backed secret assignment, SDK auto-discovery, FFP status and audit surfaces, and a single authenticated MCP API.

Live:
- [agentos.services](https://agentos.services)
- [Signup](https://www.agentos.services/signup)

## V6.1 status

V6.1 ships:
- `/studio` as the primary workflow surface
- `/appstore` with real app install, open, update, uninstall, and pin flows
- `/appstore/[slug]` with readiness, permissions, secrets, skills, targets, health, and owner analytics
- `/vault` with assignment-aware secret validation and runtime grants
- `/ffp` with runtime status, chains, audit history, consensus history, related workflows, and related apps
- SDK app auto-discovery and legacy `kernel_registry` recovery into factual public listings
- global search across apps, skills, workflows, sessions, projects, subagents, and Vault secret names only
- session branching with parent lineage and isolated branch messages and events

Rules enforced in shipped surfaces:
- no fake marketplace data
- no placeholder production apps
- no secret values in frontend responses, workflow state, Studio messages, logs, or events

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
NEXT_PUBLIC_APP_URL=https://agentos-app.vercel.app
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
- verify `/studio`, `/appstore`, `/appstore/[slug]`, `/marketplace`, `/vault`, `/ffp`, `/search`, `/developer`, `/sdk`, and `/signup`

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
