# AgentOS v6.6.4 Release Notes

Release: **Workspace Architecture & Asset System**

AgentOS v6.6.4 rebuilds every non-Studio authenticated surface around one operating-system hierarchy:

Workspace -> Home -> Studio -> Projects -> Workflows -> Library -> App Store -> Developer -> FFP -> Settings.

## Shipped

- Unified global workspace shell with fixed desktop sidebar, mobile bottom navigation, and workspace switcher
- Home command center with continue cards, workspace metrics, pinned assets, activity, installs, and updates
- Projects as context containers with Assets, Workflows, Memory, Files, and Settings tabs
- Workflows as the execution center with List, Canvas, and Execution views
- Library as the ownership center for Apps, Skills, Subagents, Memory, Vault, Connectors, Downloads, and Published assets
- App Store as discovery with SDK App, Native App, and External App badges
- Developer console tabs for My Apps, My Skills, Publishing, SDK, Analytics, Revenue, Logs, and Recovery
- FFP retained as a disabled Coming Soon launch page
- Legacy UI URLs redirected into the new IA while API routes remain stable

## Rules

- Studio chat, streaming, and Super AgentOS execution internals are unchanged.
- Vault secret values remain hidden from UI, search, logs, and browser responses.
- MCP terminology is not exposed to normal users; user-facing infrastructure uses Connectors.

## Production

- URL: [https://www.agentos.services](https://www.agentos.services)
- Deploy date: June 20, 2026
- Build: Vercel production build passed for `agent-os@6.6.4`

Tag: `v6.6.4`
