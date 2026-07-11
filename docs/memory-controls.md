# Memory Controls

AgentOS memory is durable workspace knowledge. It is separate from project context, session context, installed assets, workflow logs, app outputs, and Vault secrets.

The Memory page supports:

- viewing active and disabled memory
- editing memory content and visibility
- disabling memory without deleting it
- re-enabling disabled memory
- deleting memory with confirmation
- filtering by recall status and scope
- searching keys, content, tags, and namespace
- creating project-scoped memory from the active project

Disabled memory remains visible for management, but normal Super AgentOS recall excludes it.

Secrets must be stored in Vault, not memory. The memory API rejects credential-shaped values such as API key assignments, bearer tokens, passwords, private keys, and provider token strings before they become durable memory.

Project-scoped memory uses the active project as the namespace boundary so project context can remain distinct from global user or agent memory.
