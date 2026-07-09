# NL Studio

NL Studio is the default conversation mode at `/studio?mode=nl`.

## Chat lifecycle

Opening NL Studio without a `session` query parameter shows a clean draft. No empty session is persisted. The first message creates a session using the active workspace and project, then updates the URL with the new session.

Selecting **New chat** clears the active conversation, pending approval, composer, lineage, and session route. Selecting a recent or searched chat loads its full session bundle before updating the route.

## Streaming

`POST /api/studio/intent/stream` returns Server-Sent Events:

| Event | Purpose |
|---|---|
| `execution` | Exposes the persisted execution ID and running state |
| `status` | Updates the human-readable generation status |
| `delta` | Appends assistant text to the active message |
| `approval` | Exposes a confirmation token for approval-gated actions |
| `error` | Returns a safe user-facing failure |
| `done` | Marks the terminal `COMPLETED`, `PAUSED`, `FAILED`, or `CANCELLED` state |

Direct conversation replies stream from the model provider. Routed actions use the existing Studio intent endpoint and stream the resulting reply in bounded chunks.

## Cancellation and persistence

The stop button aborts the browser stream and requests cancellation for the active execution. Navigation to a new or existing chat waits for the stream cleanup to settle, preventing the previous request from overwriting the next conversation.

Completed replies are persisted once. If cancellation occurs after partial output, the partial assistant reply is retained when available.

## Interface

- empty-state prompt suggestions
- sticky responsive composer
- compact empty state that disappears once conversation starts
- readable active conversation column with separated user, assistant, system, streaming, stopped, and error states
- compact execution status while Super AgentOS is streaming or using selected apps, skills, workflows, or MCP tools
- stopped and failed response states with retry/regenerate controls
- safe fallback copy when streaming is unavailable
- composer pickers for files, images, apps, skills, workflows, private subagents, projects, context panels, and Universal MCP
- honest picker empty states when no connected resource is available
- Enter to send and Shift+Enter for a newline
- Markdown and GitHub-flavored Markdown rendering
- copy and edit actions
- live generation status and stop control
- searchable recent chats
- persistent NL Studio, Workflow Builder, and Code Studio modes
- mobile drawer navigation and responsive conversation layout

## Verification

The June 18, 2026 production refresh passed:

- TypeScript lint
- 370 automated tests
- production Next.js build
- Playwright signup and authenticated Studio bootstrap
- empty state and prompt suggestions
- chat send and streamed completion
- new chat and history reopening
- Workflow/Code/NL mode navigation
- mobile conversation layout
# AgentOS v6.6.3 Studio

Studio remains a single `/studio` route inside the persistent AgentOS shell. NL Studio, Workflow Builder, and Code Studio are client-side modes and retain session, project, workspace, files, workflows, terminal, composer, and execution state while switching.

The bottom composer supports auto-growth, file/image uploads, connected Skill/App/Workflow/MCP invocations, slash commands, SSE streaming, and cancellation.
