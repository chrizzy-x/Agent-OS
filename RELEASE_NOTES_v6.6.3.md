# AgentOS v6.6.3 Release Notes

Release: **Navigation & Workspace Recovery**

AgentOS v6.6.3 restores the operating-system shell removed during the v6.6.2 Studio simplification while preserving streaming chat, execution visibility, recovery, files, memory, apps, skills, workflows, subagents, Vault, and Universal MCP.

## Restored

- Persistent header, left navigation/sidebar, main content, and right context sidebar
- Workspace, project, and session context across first-class modules
- Home, Studio, Projects, Library, Skills, App Store, Subagents, Universal MCP, Vault, Community, Docs, FFP, and Settings navigation
- Recent, pinned, archived, rename, continue, archive, and delete session access
- Recent and pinned project access, creation, search, switching, and templates
- Desktop rails and mobile navigation/context drawers
- Mode-aware NL, Workflow, and Code Studio context
- Multi-agent visibility and structured composer attachments/resource invocations

## Platform Rules

- Studio remains one `/studio` route with NL, Workflow, and Code modes.
- SDK Agentic Apps remain App Store assets.
- Universal MCP external agents remain separate external connections.
- FFP is visible but disabled and returns `405` for activation attempts.
- Community contains only factual project resources.

## Verification

- TypeScript lint
- Vitest unit/integration contracts
- Production Next.js build
- Playwright desktop, tablet, and mobile shell validation

Tag: `v6.6.3`
