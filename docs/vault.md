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
- review runtime permission requests before a secret is used
- grant temporary runtime access without showing the plaintext value
- deny runtime access with an audit record
- revoke a temporary runtime grant before it is consumed

Secret values are accepted only through create or rotate forms. After submission, the UI shows masked values only. Audit metadata is redacted before persistence, and runtime logs must never include plaintext secrets.

Vault assignments grant runtime eligibility without copying secret values into the assigned app, skill, workflow, subagent, or session. A workflow may reference a Vault secret, but the value remains inside Vault and must be permissioned at runtime.

Runtime permission flow:

1. A runtime subject requests access to a named secret.
2. Vault explains the subject and reason before access is granted.
3. The user grants or denies the request.
4. A granted request returns a temporary grant id, not the secret value.
5. A denied request is audited as denied without exposing the value.
6. The user can revoke a temporary grant before it is consumed.
