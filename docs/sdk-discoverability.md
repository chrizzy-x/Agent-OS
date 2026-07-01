# AgentOS SDK Discoverability

Agentic Apps built with the AgentOS SDK are App Store assets whether they run inside or outside AgentOS.

In v6.6.7, SDK kernel registration creates or updates the corresponding App Store listing automatically. Developers can then refine the consumer-facing listing through `/publish/app` with icon, banner, screenshots, optional video, categories, tags, website, documentation, release notes, changelog, platforms, and preview metadata.

External agents connected through Universal MCP are not App Store assets. They remain in the external-agent and MCP registries with separate credentials, permissions, health, and tool visibility.
