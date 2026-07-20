# Vault

Vault is the secure permission layer for AgentOS secrets. It stores encrypted secret values, exposes only masked metadata, and keeps credentials separate from memory, project context, workflow logs, app outputs, and chat text.

Current Vault behavior:

- create encrypted secrets with uppercase labels
- edit the visible secret label without revealing the value
- rotate a secret by submitting a new value
- revoke or restore runtime access
- delete a secret with confirmation
- assign secrets to apps, skills, workflows, subagents, sessions, SDK credentials, or Super AgentOS
- inspect masked assignment, version, and access history
- keep provider-specific test actions disabled until a real validation backend exists

Secret values are accepted only through create or rotate forms. After submission, the UI shows masked values only. Audit metadata is redacted before persistence, and runtime logs must never include plaintext secrets.

Vault assignments grant runtime eligibility without copying secret values into the assigned app, skill, workflow, subagent, or session. A workflow may reference a Vault secret, but the value remains inside Vault and must be permissioned at runtime.
