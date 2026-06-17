# AgentOS V6.6.2 Release Notes

Release date: June 12, 2026
Production URL: https://www.agentos.services
Production deployment alias: https://www.agentos.services

## Summary

AgentOS V6.6.2 makes Super AgentOS the primary product experience and unifies chat, files, memory, apps, skills, workflows, MCP-facing tools, notifications, panic stop, recovery, and persisted execution into one operating layer.

## Major Changes

- Super AgentOS is now the primary navigation target and operating surface.
- Added unified persisted execution tables for executions, execution logs, notifications, failures, costs, and recovery state.
- Added execution APIs for search, detail, pause, resume, retry, cancel, rollback, recovery, panic stop, and notifications.
- Added streaming Super AgentOS responses with markdown, code blocks, execution cards, copy, retry, and edit prompt actions.
- Added session create, rename, pin, archive, delete, and search support.
- Added governed file upload, preview, summarize, rename, search, and delete flows.
- Added governed memory CRUD, search, export, and execution tracking around memory writes and deletes.
- Routed app install/open/update/uninstall, skill execution, workflow runs, file actions, and memory actions through the execution engine.
- Added Panic Button, Recovery Center, compact multi-agent execution visibility, and notification drawer.
- Removed generic production skill fallback. Production skill execution now requires real installed skill source.
- Updated desktop and mobile navigation around Super AgentOS, AppStore, Workflows, Skills, Files, and Settings.
- Fixed NL Studio layout so the message list scrolls and the composer stays anchored at the bottom of the viewport.

## Database Migration

Apply `src/storage/migrations/026_v651_unified_execution_release.sql`.

The migration adds session pin/archive/delete timestamps and creates:

- `agent_executions`
- `agent_execution_logs`
- `agent_notifications`

All new tables include deny-by-default RLS policies for direct client access.

## Verification

- `npm run lint`: passed
- `npm test`: passed, 71 files / 320 tests
- `npm run build`: passed
- Local browser smoke: public desktop and mobile routes passed with no console errors or horizontal overflow
- Production deploy: completed and aliased to https://www.agentos.services
- Live health check: `GET https://www.agentos.services/health` returned `200` with `version: 6.6.2`

## Known Verification Notes

The in-app browser could not navigate to external HTTPS URLs from this local environment, remaining on `about:blank`. Live HTTP verification succeeded through Node fetch. Local authenticated production-mode signup cannot use local fallback storage because production intentionally disables local runtime state.

## GitHub Release

Tag: `V6.6.2`

Release publishing requires valid GitHub CLI authentication for `chrizzy-x`.
