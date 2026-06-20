# AgentOS v6.6.2 Release Notes

AgentOS v6.6.2 is the execution closure release.

This release makes Super AgentOS, Library, workspace ownership, execution records, recovery, panic controls, bearer tokens, device installation, and FFP temp routing operate through real backend-backed runtime paths.

## Release Blockers Closed

- Super AgentOS chat creates a persisted chat execution and returns normal assistant text for basic prompts such as "hi".
- Chat sessions, messages, execution state, activity, and notifications persist after refresh.
- Execution records use one canonical status set: QUEUED, RUNNING, PAUSED, COMPLETED, FAILED, CANCELLED.
- Library is the workspace asset source for installed apps, installed skills, workflows, subagents, files, MCP/external connections, downloads, and activity.
- App workspace installation and device installation are separate states.
- Bearer Tokens are named, scoped, masked after creation, rotatable, revocable, and auditable.
- FFP is explicitly temporary and only routes multi-agent activity through the temporary abstraction when enabled.
- Recovery and Panic operate on real execution records.

## Verification

- `npm.cmd run lint`
- `npm.cmd test`
- `npm.cmd run build`

## June 18, 2026 NL Studio Production Refresh

- Rebuilt the NL Studio conversation layout for desktop and mobile.
- Added lazy chat creation, searchable recent chats, cross-project session reopening, and clean new-chat state.
- Added real SSE assistant streaming, Markdown/GFM rendering, live status, stop/cancel, partial-output persistence, and safe stream settlement.
- Simplified the NL Studio shell by removing the desktop context column while retaining the context drawer.
- Verified with 370 passing tests, TypeScript lint, a production Next.js build, and Playwright flows covering signup, empty state, chat send, streamed response, new chat, history reopen, mode switching, and mobile layout.

Production:

- Canonical URL: `https://www.agentos.services`
- Deployment: `https://agent-jxwgklotp-prime-labs.vercel.app`
- Vercel deployment ID: `dpl_3Bx2yZ1QsDf7WzxttAD721EWJwFW`
- Status: `READY`
- Database migration: reconciled the additive Migration 025 Studio columns that blocked chat-session creation and aligned `linked_workflow_id` with deployed workflow identifiers.

Tag: `v6.6.2`
