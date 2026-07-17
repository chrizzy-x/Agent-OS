# Library

Library is the durable AgentOS workspace inventory. It is not demo content and it is not a marketplace feed. It lists reusable assets that already belong to the signed-in user or workspace.

## Asset Sources

Library now aggregates these real workspace assets where backing data exists:

- Installed SDK apps
- Installed skills
- Incognito subagents
- Saved workflows
- Projects
- Saved execution outputs
- Generated or uploaded files
- Downloaded app packages
- Memory collections
- MCP and external connections

If no data exists for a category, Library shows an honest empty state instead of seeded production-looking content.

## Automatic Inventory

Installed apps and skills appear in Library after installation. Projects, workflows, files, memory collections, and completed execution outputs are pulled from their existing service records. Downloaded app packages appear when a cached package record exists.

## Available Actions

Library exposes direct actions where the backing API is connected:

- Open assets
- Configure installed apps and skills
- Run installed skills with published executable capabilities
- Use installed skills in Super AgentOS
- Start supported app device installs
- Uninstall installed apps
- Remove installed skills

Actions that still need dedicated backend support are visible but disabled with an explanation. This includes pinning, duplicate or fork operations, share permissions, project assignment, export, and deletion for asset types without a safe removal API.

## Data Rules

Library does not show fake installs, fake ratings, fake workflows, fake logs, fake outputs, or fake downloaded packages. Secrets never become Library memory assets. Vault-controlled credentials remain behind Vault permission flows.
