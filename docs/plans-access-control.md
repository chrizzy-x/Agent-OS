# Plans, Tiers, and Access Control

AgentOS supports four plan keys:

- `retail_free` — Free
- `retail_pro` — Pro
- `enterprise_plus` — Enterprise Plus
- `enterprise_max` — Enterprise Max

## Current Beta Billing State

All plans are priced at `$0` while beta billing is disabled. Plan changes still update capability gates and workspace metadata.

## Capability Boundaries

Free supports Super AgentOS, NL Studio, installs, workflows, incognito subagents, and Vault through browser-session access.

Pro adds bearer-token and API access.

Enterprise Plus and Enterprise Max add SDK access, Developer Console, app publishing, skill publishing, webhooks, team controls, audit visibility, and advanced analytics.

Retail users must see locked developer controls with an upgrade explanation. Developer APIs must continue to enforce the same capability gates on the backend.

## Limits

Plan limits are displayed in Settings:

- Free: 1 GB storage, 100 MB memory context, 60 requests per minute
- Pro: 10 GB storage, 1 GB memory context, 300 requests per minute
- Enterprise Plus: 100 GB storage, 10 GB memory context, 1,000 requests per minute
- Enterprise Max: 250 GB storage, 25 GB memory context, 2,500 requests per minute

## Data Discipline

Agent Credits and usage history must use real telemetry when available. Until usage records exist, Settings must show an honest availability message instead of fake usage.
