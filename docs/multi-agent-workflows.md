# Multi-Agent Workflow Collaboration

Workflow Builder supports subagent collaboration through subagent nodes.

Current behavior:

- Add a subagent node when at least one subagent exists.
- Select the subagent operator for a node.
- Define the role the subagent plays inside the workflow.
- Define handoff metadata from the previous step and to the next step.
- Show a multi-agent collaboration panel on the workflow canvas.
- Show each subagent role, selected operator, handoff source, handoff destination, privacy scope, and readiness state.
- Save role and handoff metadata into the workflow graph as node input/output.

Data discipline:

- No fake execution logs are generated in the builder.
- Per-agent logs are shown from workflow run logs when execution data exists.
- Unconfigured subagent nodes show an honest `needs subagent` state.
- MCP nodes remain visible but disabled until a real connected MCP tool exists.

Privacy discipline:

- Incognito subagent context is not copied into public workflow metadata.
- Handoff fields describe routing intent; they do not copy project files, Vault secrets, or private memory.
- Vault secrets remain references and must be permissioned at runtime.
