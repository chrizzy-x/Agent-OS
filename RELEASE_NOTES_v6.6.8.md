# AgentOS V6.6.8

Super AgentOS runtime contract release.

## Highlights

- Capability Graph now publishes canonical capability contracts with provider, version, health, inputs, outputs, permissions, dependencies, compute, cost, priority, confidence, and fallback metadata.
- Runtime Registry assets are exposed from the graph as the canonical inventory of executable workspace resources.
- Workspace Context Engine now returns context metadata, context objects, dependency hash, graph version, source diagnostics, and registry contract details for deterministic replay.
- Task Engine supports the full v6.6.8 lifecycle states, parent/root execution IDs, planner version, context version, priority, retry count, started time, and execution metadata.
- Super AgentOS message and Studio streaming flows persist context version, graph version, runtime contract, and execution metadata on created tasks.
- Migration `034_v668_runtime_contract.sql` extends production tables additively without removing v6.6.7 data.
