# AgentOS Notifications

Notifications are the product-grade alert layer for task state, workflow runs, credits, app and skill events, Vault permissions, MCP connections, billing, and security.

The global shell owns the notification bell, unread badge, drawer, read state, dismissal, and mark-all-read action.

Duplicate non-security alerts are consolidated before display so repeated workflow, permission, install, billing, or connection messages do not flood the console. Consolidated alerts keep the latest timestamp and expose a `consolidatedCount` metadata value.

Security, authentication, token, and session alerts are not consolidated. Critical security events must remain individually visible.

Notifications must not expose stack traces, raw router payloads, secrets, or fake activity. When there are no records, the drawer shows `No notifications`.
