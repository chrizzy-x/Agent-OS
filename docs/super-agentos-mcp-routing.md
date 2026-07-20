# Super AgentOS MCP Routing

Phase 39 makes Universal MCP visible inside Super AgentOS routing without pretending external actions are available when they are not.

## Current behavior

- Natural-language requests such as routing work through MCP resolve against active `mcp_servers`.
- If a matching connected MCP server exists, Super AgentOS returns a route preview and requires an explicit MCP call path before execution.
- If no connector matches, Super AgentOS returns a reconnect-required state instead of claiming execution.
- Explicit `mcp call <server> <tool> --json ...` commands keep the existing approval preview before mutating external actions run.
- NL Studio renders compact MCP route cards for ready and reconnect states.

## Product boundary

Universal MCP is the external connector layer. SDK apps are registered, verified, listed, installed, and monetized through Appstore flows. MCP tools do not become Appstore apps automatically.

## Data discipline

AgentOS must not show fake connected tools, fake health, fake permission approvals, fake logs, or fake external action success. Empty and reconnect states are the correct behavior when real connector data is unavailable.
