# AgentOS Navigation

Top-level sidebar order:

Home, Studio, Library, Appstore, Skillstore, Developer, Projects, Subagents, Workflows, Memory, Vault, Universal MCP, Community, FFP, Resources, Settings.

Notifications, Billing, and Profile are not primary sidebar items. Notifications open from the bell beside the avatar. Billing and Profile live inside Settings at `?section=billing` and `?section=account`.

FFP is visible as disabled Coming Soon. No module is placed behind a More menu.

The left sidebar is 280px expanded and 72px collapsed. Collapse state is stored in `localStorage`. Below 768px the left and right rails become accessible drawers.

The sidebar also exposes workspace selection, quick actions, recent/pinned/archived sessions, and recent/pinned projects.
