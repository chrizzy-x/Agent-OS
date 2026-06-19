# AgentOS v6.6.3 Feature-Parity Audit

| Surface | Existing capability preserved | Recovery action |
| --- | --- | --- |
| Home | command entry, recent chats, projects, context metrics | place inside persistent OS shell |
| Studio | NL streaming, cancellation, session CRUD, workflow/code modes, files, terminal, executions, recovery | retain provider state; remove nested shell; restore global rails and complete composer |
| Projects | search, create API, archive/delete, project detail tabs | add real pinning, switching, templates, and shell shortcuts |
| Library | apps, skills, workflows, subagents, files, downloads, activity | expose complete filters and workspace scoping |
| Skills | installed management, discovery, install, detail | keep separate from App Store and add explicit module tabs |
| App Store | discovery, install/open/update/remove, SDK discovery, developer data | keep separate from Skills and surface featured/developer views |
| Subagents | create, edit, archive, visibility, capabilities, memory, Vault, sharing | add explicit Private Mode and workflow/memory assignments |
| Universal MCP | connectors, tools, diagnostics, calls, external-agent registry | consolidate as one first-class module without mixing SDK apps |
| Vault | secret CRUD, assignments, versions, runtime grants | preserve page actions and context panel |
| Community | no current route | add factual links hub only |
| Docs | guide, API, Studio, SDK, FFP, templates | place inside persistent OS shell |
| FFP | temporary toggle and routing abstraction | force disabled, make page read-only Coming Soon, retain compatibility data |
| Settings | profile, workspace, sessions, tokens, billing links | preserve under top-level Settings |
| Global shell | duplicated `Nav`, `SurfaceShell`, `WorkspaceShell`, Studio shell | replace with one root-mounted persistent shell |
| Mobile | bottom nav and “More” drawer | replace with accessible left/right drawers |

Existing APIs, drawers, route aliases, execution records, notifications, panic controls, streaming, recovery, governed files, governed memory, SDK discovery, and external-agent registration remain in scope and must not regress.
