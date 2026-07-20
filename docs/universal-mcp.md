# Universal MCP

Universal MCP is AgentOS's external connector layer. It connects outside tools and external agents to Super AgentOS without turning them into Appstore apps.

Current MCP behavior:

- list registered MCP servers
- list primitive, skill-backed, and external MCP tools
- show connected external agents
- show connector health derived from real MCP call history
- show supported actions reported by each connector
- show permission scope and related workspace subjects
- show recent MCP logs from real connector calls
- keep connection setup visible but disabled until safe server registration is available
- keep health-check and disconnect controls disabled until the backend supports those actions

SDK apps and MCP connectors are separate product layers. SDK apps use registration, verification, listing metadata, installation, Library presence, pricing, and Appstore discovery. MCP connectors expose external tools and agents for routing, permission review, and execution.

The MCP page must not show fake connectors, fake logs, fake health checks, fake installs, or fake Appstore listings. Empty states explain when real connector data does not exist.
