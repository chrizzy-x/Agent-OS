# Projects

Projects are durable context containers for AgentOS work. A project can hold Studio sessions, installed workspace apps, installed skills, workflows, incognito subagents, files, memory references, Vault availability, and connected MCP tools.

## Current Behavior

The Projects index supports project search, pinned projects, project creation, and workspace-scoped project cards. Project detail pages expose:

- Overview and project activity summary
- Attached sessions, apps, skills, workflows, incognito operators, and files
- Project asset and activity tabs
- Project search entry point
- Studio entry with project and workspace context preserved
- Edit details
- Archive and restore
- Delete with confirmation where the backend allows it

## Data Rules

Projects do not show fake activity, fake assets, fake files, or fake assignment state. Asset assignment is visible as a disabled action until a dedicated assignment API exists. Project deletion is blocked for default workspace projects and only succeeds when the backend confirms it is safe.

## Context Rules

Opening a project detail page syncs the active workspace and project context into the global AgentOS shell. Opening Studio from a project preserves that project context for Super AgentOS, NL Studio, Workflow Builder, and Code Studio.
