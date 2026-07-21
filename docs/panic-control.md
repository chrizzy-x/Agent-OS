# Panic Control

Panic Control is the always-available execution safety control inside AgentOS authenticated surfaces.

Current behavior:

- `Pause runs` pauses active executions in the current workspace/session.
- `Stop all` cancels active executions in the current workspace/session.
- `Lockdown` cancels active executions and disables MCP runtime access and Vault runtime grants until re-authentication.
- `Diagnostics` sends the user to Universal MCP health and connection diagnostics.

Panic Control does not claim to stop unavailable external systems. If AgentOS cannot reach the panic backend, the UI keeps the control visible and shows an unavailable state. If there are no active executions in scope, destructive actions stay disabled with a clear reason.

Secrets are never displayed in Panic Control. Lockdown only changes runtime permission state and redacts sensitive logs through the existing Vault and MCP guards.
