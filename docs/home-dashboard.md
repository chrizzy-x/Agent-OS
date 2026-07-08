# AgentOS Home Dashboard

Home is the command overview for an authenticated AgentOS workspace. It must not behave as a marketing page after sign-in.

Home is backed by `/api/dashboard` and renders only:

- real workspace data returned by the backend
- honest empty states when the user has no data
- actionable error states when the dashboard cannot load
- disabled states when a product capability is visible but no backend is connected

The dashboard contract includes recent Studio sessions, active projects, installed SDK apps, installed skills, active workflows, private subagents, Vault health, Universal MCP status, recent events, plan metadata, recommended next actions, and compute visibility.

Agent Credits are visible on Home only as a disabled state until real credit telemetry exists. Home must not invent credit balances, reset windows, usage history, earnings, workflow logs, validators, proof events, MCP calls, installs, ratings, or app usage.

Vault data shown on Home is limited to aggregate health. Secret names and secret values must not appear in the Home dashboard or become normal memory.
