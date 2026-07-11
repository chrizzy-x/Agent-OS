# Workflow Builder

Workflow Builder is the Studio mode for reusable AgentOS execution graphs.

Current production behavior:

- create a private workflow from Studio
- edit an existing workflow
- add prompt, skill, app, incognito subagent, Vault permission, trigger, and output nodes
- configure node labels, descriptions, runtime input instructions, and expected outputs
- persist visual graphs through the canonical workflow document
- preserve active workspace and project context when saving
- show per-node readiness states before save
- keep Vault nodes as secret references only; secret values are never saved into workflow state
- show Universal MCP nodes as disabled until a connected MCP tool is available in the workspace

Workflow Builder saves graph data to `agent_workflows.graph_state`, synchronized executable steps to `agent_workflows.steps`, and canonical workflow metadata to `agent_workflows.canonical_doc`.

Phase 18 does not claim full workflow run lifecycle. Manual runs, logs, retry, cancel, and scheduled run controls are handled by later workflow runtime phases.
