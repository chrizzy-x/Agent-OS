# Marketplace

AgentOS V6.6.7 treats apps as installable products and skills as installable capabilities.

## Surfaces

- `/appstore`: full-width consumer App Store with visible search, categories, a 320px desktop hero, featured, trending, new, recommended, ratings, screenshots, version, compatibility, developer attribution, Install, Open, and Manage.
- `/skillstore`: technical Skill Store with visible search, featured, trending, recommended, compatibility, capability tags, screenshots, version history, skill details, Use, Manage, and Install.
- `/apps`: installed apps only, with open, manage, update, pin, and remove actions.
- `/skills`: installed skills only, with configure, enable, disable, and remove actions.
- `/appstore/[slug]`: app listing with banner, icon, screenshots, optional video link, features, reviews, downloads, active users, version, platforms, release notes, changelog, similar apps, install, open, and install-to-device.
- `/skills/[slug]`: skill listing with banner, icon, screenshots, optional video link, capabilities, examples, inputs, outputs, execution preview, permissions, dependencies, compatibility, release notes, and version history.
- `/developer/[handle]`: searchable developer profile with published apps, published skills, followers, downloads, active users, ratings, recent releases, socials, and verification status.
- `/library`: inventory-only ownership surface for installed apps, skills, agents, workflows, memory, files, connectors, and saved prompts. Discovery stays in Appstore and Skillstore.

## Density

App Store rows use a fixed marketplace grid: 5 cards on desktop, 3 on tablet, and 1-2 on mobile, with cards held between compact marketplace dimensions. Skill Store keeps a denser, more technical card treatment with capability and compatibility metadata.

## Ownership

Installing apps or skills creates durable ownership and writes:

- `marketplace_ownership`
- `marketplace_install_history`
- `marketplace_permission_history`
- `library_items`
- `workspace_asset_registry`

Device removal does not revoke ownership. App package cache records keep offline reinstall available when an app has been installed into a workspace.

## Workspace Assets

Installed apps, installed skills, workflows, subagents, files, vault assets, memory references, and MCP connections are represented as workspace assets. Super AgentOS receives these assets through Studio bootstrap context and can route work to installed capabilities without requiring manual navigation.
