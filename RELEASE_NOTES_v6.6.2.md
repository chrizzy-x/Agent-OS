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

Tag: `v6.6.2`
