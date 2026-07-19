# Subagents

Subagents are user-created operators inside AgentOS. The user-facing product types are Incognito, Public, and Workflow.

Incognito is the default mode for user-created operators. The underlying storage enum remains `private` for compatibility, but the product UI should not expose that as the primary label.

Current behavior:

- Create subagents from the Subagents surface.
- View and edit name, description, instructions, type, and manual capabilities.
- Duplicate a subagent into the same workspace/project context.
- Pause and resume a subagent by moving it in and out of active use.
- Delete a subagent through a confirmation dialog. The backend archives the record so audit history can remain available where supported.
- Assign a subagent to a project.
- Assign a subagent to workflows and memory through permission grants.
- Attach installed skills and installed apps through capability tokens.
- Run a test command against a subagent.
- View subagent-scoped memory, Vault assignments, permissions, tool permissions, and activity.

Data discipline:

- No fake apps, skills, memory, Vault assignments, permissions, workflows, or logs are displayed.
- App attachment currently uses `app:<slug>` capability tokens because dedicated app-assignment records do not exist yet.
- Memory shown on the detail page is scoped to the subagent namespace.
- Vault secrets are shown only as assigned secret labels/masked values; secret values are not displayed as memory or normal context.

Privacy discipline:

- Incognito subagents are private user-created operators.
- Public subagents and Workflow subagents are distinct product modes.
- Subagent context should not leak across projects unless explicitly assigned or shared through a grant.
