'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, EmptyState, Input, Select, Textarea } from '@/components/os/ui';
import { useStudio } from '@/components/studio/StudioProvider';
import { fetchWithBrowserSession } from '@/src/auth/browser-session';

type BuilderNodeType = 'trigger' | 'prompt' | 'skill' | 'app' | 'subagent' | 'vault' | 'mcp' | 'output';

type BuilderNode = {
  id: string;
  type: BuilderNodeType;
  label: string;
  description: string;
  tool: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  order: number;
};

type DraftWorkflow = {
  id: string | null;
  name: string;
  summary: string;
  status: string;
  nodes: BuilderNode[];
};

type WorkflowGraph = {
  nodes?: unknown[];
  edges?: unknown[];
};

const EXECUTABLE_NODE_TYPES = new Set<BuilderNodeType>(['prompt', 'skill', 'app', 'subagent', 'vault', 'mcp']);

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nodeId(type: BuilderNodeType) {
  return `${type}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
}

function createNode(type: BuilderNodeType, order: number, seed?: Partial<BuilderNode>): BuilderNode {
  const defaults: Record<BuilderNodeType, Omit<BuilderNode, 'id' | 'order'>> = {
    trigger: {
      type: 'trigger',
      label: 'Manual trigger',
      description: 'Starts when a user runs the workflow.',
      tool: 'agentos.trigger.manual',
      input: { trigger: 'manual' },
      output: { event: 'workflow_started' },
    },
    prompt: {
      type: 'prompt',
      label: 'Prompt step',
      description: 'Ask Super AgentOS to perform a focused task.',
      tool: 'agentos.prompt',
      input: { instructions: 'Describe the work this step should perform.' },
      output: { expected: 'A concise result for the next step.' },
    },
    skill: {
      type: 'skill',
      label: 'Skill step',
      description: 'Run an installed skill.',
      tool: 'skill.unconfigured.run',
      input: { instructions: 'Describe the skill input.' },
      output: { expected: 'Skill result.' },
    },
    app: {
      type: 'app',
      label: 'App step',
      description: 'Open or run an installed app.',
      tool: 'agentos.app.unconfigured.run',
      input: { instructions: 'Describe the app task.' },
      output: { expected: 'App result.' },
    },
    subagent: {
      type: 'subagent',
      label: 'Subagent step',
      description: 'Delegate work to an incognito subagent.',
      tool: 'agentos.subagent.unconfigured.run',
      input: { instructions: 'Describe the delegated task.' },
      output: { expected: 'Subagent result.' },
    },
    vault: {
      type: 'vault',
      label: 'Vault permission',
      description: 'Request permission to use a Vault secret at runtime.',
      tool: 'agentos.vault.request',
      input: { reason: 'Explain why this workflow needs the selected secret.' },
      output: { expected: 'Permission granted or denied.' },
    },
    mcp: {
      type: 'mcp',
      label: 'MCP tool',
      description: 'Route to a connected Universal MCP tool.',
      tool: 'mcp.unconfigured.tool',
      input: { instructions: 'Connect an MCP tool before configuring this node.' },
      output: { expected: 'External tool result.' },
    },
    output: {
      type: 'output',
      label: 'Save output',
      description: 'Save the final result to the workspace.',
      tool: 'agentos.output.save',
      input: { destination: 'workspace_output' },
      output: { artifact: 'saved_output' },
    },
  };
  return {
    ...defaults[type],
    ...seed,
    type,
    id: seed?.id ?? nodeId(type),
    order,
    input: { ...defaults[type].input, ...(seed?.input ?? {}) },
    output: { ...defaults[type].output, ...(seed?.output ?? {}) },
  };
}

function starterDraft(projectName?: string): DraftWorkflow {
  return {
    id: null,
    name: projectName ? `${projectName} workflow` : 'New workflow',
    summary: 'Reusable execution graph for Super AgentOS.',
    status: 'draft',
    nodes: [
      createNode('trigger', 1),
      createNode('prompt', 2),
      createNode('output', 3),
    ],
  };
}

function normalizeBuilderNodeType(value: unknown): BuilderNodeType {
  if (value === 'step' || value === 'condition') return 'prompt';
  const allowed: BuilderNodeType[] = ['trigger', 'prompt', 'skill', 'app', 'subagent', 'vault', 'mcp', 'output'];
  return typeof value === 'string' && allowed.includes(value as BuilderNodeType) ? value as BuilderNodeType : 'prompt';
}

function fromWorkflow(workflow: {
  id: string;
  name: string;
  summary: string | null;
  status: string;
  graph_state?: WorkflowGraph;
  steps?: Array<Record<string, unknown>>;
}): DraftWorkflow {
  const graphNodes = Array.isArray(workflow.graph_state?.nodes) ? workflow.graph_state.nodes as Array<Record<string, unknown>> : [];
  const sourceNodes = graphNodes.length > 0
    ? graphNodes
    : (workflow.steps ?? []).map((step, index) => ({
      id: `step-${index + 1}`,
      type: 'prompt',
      label: text(step.description, `Step ${index + 1}`),
      description: text(step.description, `Step ${index + 1}`),
      tool: text(step.tool, 'agentos.prompt'),
      input: step.input,
      output: step.output,
      order: index + 1,
    }));
  const nodes = sourceNodes.length > 0
    ? sourceNodes.map((node, index) => {
      const type = normalizeBuilderNodeType(node.type);
      return createNode(type, index + 1, {
        id: text(node.id, `node-${index + 1}`),
        label: text(node.label, text(node.description, `Step ${index + 1}`)),
        description: text(node.description, text(node.label, `Step ${index + 1}`)),
        tool: text(node.tool, 'agentos.prompt'),
        input: node.input && typeof node.input === 'object' && !Array.isArray(node.input) ? node.input as Record<string, unknown> : {},
        output: node.output && typeof node.output === 'object' && !Array.isArray(node.output) ? node.output as Record<string, unknown> : {},
      });
    })
    : starterDraft().nodes;

  return {
    id: workflow.id,
    name: workflow.name,
    summary: workflow.summary ?? '',
    status: workflow.status,
    nodes: normalizeOrders(nodes),
  };
}

function normalizeOrders(nodes: BuilderNode[]): BuilderNode[] {
  return nodes.map((node, index) => ({ ...node, order: index + 1 }));
}

function buildGraph(nodes: BuilderNode[]) {
  const ordered = normalizeOrders(nodes);
  return {
    nodes: ordered.map((node, index) => ({
      id: node.id,
      type: node.type,
      label: node.label,
      description: node.description,
      tool: node.tool,
      input: node.input,
      output: node.output,
      order: node.order,
      position: { x: 80 + (index * 180), y: 120 },
    })),
    edges: ordered.slice(1).map((node, index) => ({
      id: `edge-${index + 1}`,
      source: ordered[index].id,
      target: node.id,
      condition: null,
    })),
  };
}

function nodeStatus(node: BuilderNode, resources: {
  skills: number;
  apps: number;
  subagents: number;
  secrets: number;
}) {
  if (node.type === 'trigger' || node.type === 'output') return { label: 'configured', tone: 'success' as const, blocking: false };
  if (node.type === 'mcp') return { label: 'connect MCP first', tone: 'warning' as const, blocking: true };
  if (node.type === 'skill' && (resources.skills === 0 || node.tool.includes('unconfigured'))) return { label: 'needs skill', tone: 'warning' as const, blocking: true };
  if (node.type === 'app' && (resources.apps === 0 || node.tool.includes('unconfigured'))) return { label: 'needs app', tone: 'warning' as const, blocking: true };
  if (node.type === 'subagent' && (resources.subagents === 0 || node.tool.includes('unconfigured'))) return { label: 'needs subagent', tone: 'warning' as const, blocking: true };
  if (node.type === 'vault' && (resources.secrets === 0 || !text(node.input.secretId))) return { label: 'needs Vault permission', tone: 'warning' as const, blocking: true };
  if (!text(node.input.instructions) && node.type !== 'vault') return { label: 'needs input', tone: 'warning' as const, blocking: true };
  return { label: node.type === 'vault' ? 'permissioned' : 'ready', tone: 'success' as const, blocking: false };
}

export default function WorkflowStudioPanel() {
  const {
    workflows,
    workspaces,
    currentProject,
    installedSkills,
    installedApps,
    subagents,
    vaultSecrets,
    sending,
    refresh,
  } = useStudio();
  const activeWorkspaceId = currentProject?.workspaceId ?? workspaces[0]?.id ?? null;
  const [draft, setDraft] = useState<DraftWorkflow>(() => starterDraft(currentProject?.name));
  const [selectedNodeId, setSelectedNodeId] = useState(draft.nodes[1]?.id ?? draft.nodes[0]?.id ?? '');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (dirty) return;
    const first = workflows[0];
    const next = first ? fromWorkflow(first) : starterDraft(currentProject?.name);
    setDraft(next);
    setSelectedNodeId(next.nodes[1]?.id ?? next.nodes[0]?.id ?? '');
  }, [currentProject?.name, dirty, workflows]);

  const selectedNode = useMemo(
    () => draft.nodes.find(node => node.id === selectedNodeId) ?? draft.nodes[0] ?? null,
    [draft.nodes, selectedNodeId],
  );

  const resourceCounts = {
    skills: installedSkills.length,
    apps: installedApps.length,
    subagents: subagents.length,
    secrets: vaultSecrets.length,
  };
  const blockers = draft.nodes
    .map(node => nodeStatus(node, resourceCounts))
    .filter(status => status.blocking);
  const hasExecutableNode = draft.nodes.some(node => EXECUTABLE_NODE_TYPES.has(node.type));
  const canSave = Boolean(draft.name.trim() && activeWorkspaceId && hasExecutableNode && blockers.length === 0);

  function updateDraft(updater: (current: DraftWorkflow) => DraftWorkflow) {
    setDirty(true);
    setDraft(current => updater(current));
  }

  function updateNode(updater: (node: BuilderNode) => BuilderNode) {
    if (!selectedNode) return;
    updateDraft(current => ({
      ...current,
      nodes: current.nodes.map(node => node.id === selectedNode.id ? updater(node) : node),
    }));
  }

  function addNode(type: BuilderNodeType) {
    const nextNode = createNode(type, draft.nodes.length + 1);
    updateDraft(current => ({ ...current, nodes: normalizeOrders([...current.nodes, nextNode]) }));
    setSelectedNodeId(nextNode.id);
  }

  function removeNode(id: string) {
    const remaining = normalizeOrders(draft.nodes.filter(node => node.id !== id));
    const nextNodes = remaining.length > 0 ? remaining : starterDraft(currentProject?.name).nodes;
    setDirty(true);
    setDraft(current => ({ ...current, nodes: nextNodes }));
    setSelectedNodeId(nextNodes[0]?.id ?? '');
  }

  function moveNode(id: string, direction: -1 | 1) {
    updateDraft(current => {
      const index = current.nodes.findIndex(node => node.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.nodes.length) return current;
      const nodes = [...current.nodes];
      const [node] = nodes.splice(index, 1);
      nodes.splice(nextIndex, 0, node);
      return { ...current, nodes: normalizeOrders(nodes) };
    });
  }

  function bindResource(node: BuilderNode, resourceId: string) {
    if (node.type === 'skill') {
      const skill = installedSkills.find(item => item.id === resourceId || item.slug === resourceId);
      if (!skill) return node;
      return {
        ...node,
        label: skill.name,
        tool: `skill.${skill.slug}.run`,
        input: { ...node.input, skillId: skill.id, skillSlug: skill.slug },
      };
    }
    if (node.type === 'app') {
      const app = installedApps.find(item => item.id === resourceId || item.slug === resourceId);
      if (!app) return node;
      return {
        ...node,
        label: app.name,
        tool: `agentos.app.${app.slug}.run`,
        input: { ...node.input, appId: app.id, appSlug: app.slug },
      };
    }
    if (node.type === 'subagent') {
      const subagent = subagents.find(item => item.id === resourceId);
      if (!subagent) return node;
      return {
        ...node,
        label: subagent.name,
        tool: `agentos.subagent.${subagent.id}.run`,
        input: { ...node.input, subagentId: subagent.id },
      };
    }
    if (node.type === 'vault') {
      const secret = vaultSecrets.find(item => item.id === resourceId);
      if (!secret) return node;
      return {
        ...node,
        label: `Vault: ${secret.name}`,
        input: { ...node.input, secretId: secret.id, secretName: secret.name },
      };
    }
    return node;
  }

  async function saveWorkflow() {
    if (!canSave || saving) return;
    setSaving(true);
    setNotice('');
    try {
      const payload = {
        name: draft.name.trim(),
        summary: draft.summary.trim() || null,
        mode: 'visual',
        graph: buildGraph(draft.nodes),
        workspaceId: activeWorkspaceId,
        projectId: currentProject?.id ?? null,
        visibility: 'private',
      };
      const endpoint = draft.id ? `/api/agent/workflows/${encodeURIComponent(draft.id)}` : '/api/agent/workflows';
      const response = await fetchWithBrowserSession(endpoint, {
        method: draft.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.response.json().catch(() => ({})) as { workflow?: { id?: string }; error?: string; message?: string };
      if (response.response.ok) {
        setNotice(draft.id ? 'Workflow updated.' : 'Workflow created.');
        if (body.workflow?.id) setDraft(current => ({ ...current, id: body.workflow?.id ?? current.id, status: 'active' }));
        setDirty(false);
        await refresh();
      } else {
        setNotice(body.error ?? body.message ?? 'Workflow save failed.');
      }
    } catch {
      setNotice('Workflow save failed.');
    } finally {
      setSaving(false);
    }
  }

  const selectedStatus = selectedNode ? nodeStatus(selectedNode, resourceCounts) : null;

  return (
    <div className="workflow-studio">
      <header className="workflow-toolbar">
        <div>
          <div className="nl-kicker">Workflow Builder</div>
          <h1>{draft.name || 'Workflow Builder'}</h1>
          <p>Build reusable execution graphs from prompts, installed skills, apps, subagents, Vault permissions, MCP tools, triggers, and outputs.</p>
        </div>
        <div className="workflow-actions">
          <Button onClick={() => void saveWorkflow()} loading={saving} disabled={!canSave || sending} disabledReason={
            !activeWorkspaceId ? 'Select a workspace before saving.'
              : !draft.name.trim() ? 'Name the workflow before saving.'
                : !hasExecutableNode ? 'Add at least one executable prompt, skill, app, subagent, Vault, or MCP node.'
                  : blockers.length > 0 ? 'Resolve blocked nodes before saving.'
                    : sending ? 'Super AgentOS is busy.'
                      : undefined
          }>Save workflow</Button>
          <Button variant="secondary" onClick={() => { const next = starterDraft(currentProject?.name); setDraft(next); setSelectedNodeId(next.nodes[1]?.id ?? next.nodes[0]?.id ?? ''); setDirty(true); setNotice('New workflow draft started.'); }}>New</Button>
          <Button variant="ghost" href={draft.id ? `/workflows/${encodeURIComponent(draft.id)}` : undefined} disabled={!draft.id} disabledReason="Save the workflow before opening its runtime page.">Open details</Button>
        </div>
      </header>

      {notice ? <div className="workflow-notice">{notice}</div> : null}

      <main className="workflow-builder-grid">
        <aside className="workflow-pane saved">
          <div className="workflow-pane-title">Saved workflows</div>
          {workflows.length === 0 ? (
            <EmptyState title="No workflows yet" body="Create a workflow draft, add nodes, configure inputs and outputs, then save it." />
          ) : workflows.slice(0, 8).map(workflow => (
            <button
              key={workflow.id}
              type="button"
              className={`workflow-list-item${draft.id === workflow.id ? ' active' : ''}`}
              onClick={() => { const next = fromWorkflow(workflow); setDraft(next); setSelectedNodeId(next.nodes[1]?.id ?? next.nodes[0]?.id ?? ''); setDirty(false); setNotice(''); }}
            >
              <span>{workflow.name}</span>
              <Badge tone={workflow.status === 'active' ? 'success' : 'warning'}>{workflow.status}</Badge>
            </button>
          ))}
        </aside>

        <section className="workflow-pane canvas" aria-label="Workflow canvas">
          <div className="workflow-meta-grid">
            <Input aria-label="Workflow name" value={draft.name} onChange={event => updateDraft(current => ({ ...current, name: event.target.value }))} placeholder="Workflow name" />
            <Textarea aria-label="Workflow summary" value={draft.summary} onChange={event => updateDraft(current => ({ ...current, summary: event.target.value }))} placeholder="What does this workflow do?" rows={2} />
          </div>

          <div className="node-add-row" aria-label="Add workflow nodes">
            <Button variant="secondary" onClick={() => addNode('prompt')}>Prompt</Button>
            <Button variant="secondary" onClick={() => addNode('skill')} disabled={installedSkills.length === 0} disabledReason="Install a skill before adding a skill node.">Skill</Button>
            <Button variant="secondary" onClick={() => addNode('app')} disabled={installedApps.length === 0} disabledReason="Install an app before adding an app node.">App</Button>
          <Button variant="secondary" onClick={() => addNode('subagent')} disabled={subagents.length === 0} disabledReason="Create an incognito subagent before adding a subagent node.">Subagent</Button>
            <Button variant="secondary" onClick={() => addNode('vault')} disabled={vaultSecrets.length === 0} disabledReason="Add a Vault secret before adding a Vault permission node.">Vault</Button>
            <Button variant="secondary" onClick={() => addNode('mcp')} disabled disabledReason="Connect a Universal MCP tool before adding an MCP node.">MCP</Button>
            <Button variant="secondary" onClick={() => addNode('output')}>Output</Button>
          </div>

          <div className="workflow-node-stack">
            {draft.nodes.map((node, index) => {
              const status = nodeStatus(node, resourceCounts);
              return (
                <button
                  type="button"
                  key={node.id}
                  className={`workflow-node${selectedNode?.id === node.id ? ' selected' : ''}`}
                  onClick={() => setSelectedNodeId(node.id)}
                >
                  <span className="node-order">{index + 1}</span>
                  <span>
                    <strong>{node.label}</strong>
                    <small>{node.description}</small>
                  </span>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="workflow-pane inspector">
          {!selectedNode ? (
            <EmptyState title="No node selected" body="Select or add a node to configure it." />
          ) : (
            <>
              <div className="workflow-pane-head">
                <div>
                  <div className="workflow-pane-title">Node configuration</div>
                  <div className="os-entity-copy">{selectedNode.type}</div>
                </div>
                {selectedStatus ? <Badge tone={selectedStatus.tone}>{selectedStatus.label}</Badge> : null}
              </div>

              <label className="workflow-field">
                <span>Label</span>
                <Input value={selectedNode.label} onChange={event => updateNode(node => ({ ...node, label: event.target.value }))} />
              </label>

              <label className="workflow-field">
                <span>Description</span>
                <Textarea value={selectedNode.description} onChange={event => updateNode(node => ({ ...node, description: event.target.value }))} rows={2} />
              </label>

              {selectedNode.type === 'skill' ? (
                <label className="workflow-field">
                  <span>Installed skill</span>
                  <Select data-testid="workflow-skill-resource" aria-label="Installed skill selector" value={text(selectedNode.input.skillId) || text(selectedNode.input.skillSlug)} onChange={event => updateNode(node => bindResource(node, event.target.value))}>
                    <option value="">Select skill</option>
                    {installedSkills.map(skill => <option key={skill.id} value={skill.id}>{skill.name}</option>)}
                  </Select>
                </label>
              ) : null}

              {selectedNode.type === 'app' ? (
                <label className="workflow-field">
                  <span>Installed app</span>
                  <Select data-testid="workflow-app-resource" aria-label="Installed app selector" value={text(selectedNode.input.appId) || text(selectedNode.input.appSlug)} onChange={event => updateNode(node => bindResource(node, event.target.value))}>
                    <option value="">Select app</option>
                    {installedApps.map(app => <option key={app.id} value={app.id}>{app.name}</option>)}
                  </Select>
                </label>
              ) : null}

              {selectedNode.type === 'subagent' ? (
                <label className="workflow-field">
                  <span>Incognito subagent</span>
                  <Select data-testid="workflow-subagent-resource" aria-label="Incognito subagent selector" value={text(selectedNode.input.subagentId)} onChange={event => updateNode(node => bindResource(node, event.target.value))}>
                    <option value="">Select subagent</option>
                    {subagents.map(subagent => <option key={subagent.id} value={subagent.id}>{subagent.name}</option>)}
                  </Select>
                </label>
              ) : null}

              {selectedNode.type === 'vault' ? (
                <label className="workflow-field">
                  <span>Vault secret name</span>
                  <Select data-testid="workflow-vault-resource" aria-label="Vault secret selector" value={text(selectedNode.input.secretId)} onChange={event => updateNode(node => bindResource(node, event.target.value))}>
                    <option value="">Select secret</option>
                    {vaultSecrets.map(secret => <option key={secret.id} value={secret.id}>{secret.name}</option>)}
                  </Select>
                  <small>Only the secret reference is saved. Secret values stay inside Vault.</small>
                </label>
              ) : null}

              {selectedNode.type === 'mcp' ? (
                <div className="workflow-disabled-note">Universal MCP nodes are visible but disabled until a connected MCP tool is available in this workspace.</div>
              ) : null}

              <label className="workflow-field">
                <span>{selectedNode.type === 'vault' ? 'Permission reason' : 'Input instructions'}</span>
                <Textarea
                  data-testid="workflow-node-input"
                  aria-label="Node input instructions"
                  value={text(selectedNode.input.instructions, text(selectedNode.input.reason))}
                  onChange={event => updateNode(node => ({
                    ...node,
                    input: {
                      ...node.input,
                      [node.type === 'vault' ? 'reason' : 'instructions']: event.target.value,
                    },
                  }))}
                  rows={4}
                />
              </label>

              <label className="workflow-field">
                <span>Expected output</span>
                <Textarea
                  data-testid="workflow-node-output"
                  aria-label="Node expected output"
                  value={text(selectedNode.output.expected, text(selectedNode.output.artifact))}
                  onChange={event => updateNode(node => ({
                    ...node,
                    output: {
                      ...node.output,
                      [node.type === 'output' ? 'artifact' : 'expected']: event.target.value,
                    },
                  }))}
                  rows={3}
                />
              </label>

              <div className="workflow-node-actions">
                <Button variant="secondary" onClick={() => moveNode(selectedNode.id, -1)} disabled={selectedNode.order === 1} disabledReason="This node is already first.">Move up</Button>
                <Button variant="secondary" onClick={() => moveNode(selectedNode.id, 1)} disabled={selectedNode.order === draft.nodes.length} disabledReason="This node is already last.">Move down</Button>
                <Button variant="danger" onClick={() => removeNode(selectedNode.id)} disabled={draft.nodes.length <= 1} disabledReason="A workflow needs at least one node.">Delete</Button>
              </div>
            </>
          )}
        </aside>
      </main>

      <style>{`
        .workflow-studio {
          min-height: 0;
          height: 100%;
          display: grid;
          grid-template-rows: auto auto minmax(0, 1fr);
          overflow: hidden;
        }

        .workflow-toolbar {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          padding: 14px 18px;
          border-bottom: 1px solid var(--border);
        }

        .workflow-toolbar h1 {
          margin: 0;
          font-size: 1.35rem;
          letter-spacing: 0;
        }

        .workflow-toolbar p {
          max-width: 720px;
          margin: 4px 0 0;
          color: var(--text-secondary);
          font-size: 0.9rem;
          line-height: 1.45;
        }

        .workflow-actions,
        .node-add-row,
        .workflow-node-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }

        .workflow-notice {
          margin: 10px 18px 0;
          padding: 10px 12px;
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text-secondary);
          background: rgba(255,255,255,0.025);
        }

        .workflow-builder-grid {
          min-height: 0;
          display: grid;
          grid-template-columns: minmax(190px, 0.8fr) minmax(320px, 1.5fr) minmax(280px, 1fr);
          gap: 12px;
          padding: 12px 18px 18px;
          overflow: hidden;
        }

        .workflow-pane {
          position: relative;
          min-width: 0;
          min-height: 0;
          display: grid;
          align-content: start;
          gap: 12px;
          overflow: auto;
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 12px;
          background: rgba(255,255,255,0.018);
        }

        .workflow-pane.canvas {
          z-index: 2;
        }

        .workflow-pane.inspector,
        .workflow-pane.saved {
          z-index: 1;
        }

        .workflow-pane-title {
          font-weight: 800;
          color: var(--text-primary);
        }

        .workflow-pane-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 10px;
        }

        .workflow-list-item,
        .workflow-node {
          width: 100%;
          min-height: 42px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 9px 10px;
          color: var(--text-secondary);
          background: transparent;
          text-align: left;
        }

        .workflow-list-item.active,
        .workflow-node.selected {
          color: var(--text-primary);
          border-color: var(--accent);
          background: rgba(255,255,255,0.035);
        }

        .workflow-meta-grid {
          display: grid;
          grid-template-columns: minmax(180px, 0.8fr) minmax(220px, 1.2fr);
          gap: 10px;
        }

        .workflow-node-stack {
          display: grid;
          gap: 8px;
        }

        .workflow-node {
          justify-content: start;
          grid-template-columns: auto minmax(0, 1fr) auto;
        }

        .workflow-node strong,
        .workflow-node small {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .workflow-node small {
          margin-top: 2px;
          color: var(--text-tertiary);
        }

        .node-order {
          width: 26px;
          height: 26px;
          display: inline-grid;
          place-items: center;
          border-radius: 999px;
          background: rgba(255,255,255,0.06);
          color: var(--text-primary);
          font-weight: 800;
          font-size: 0.78rem;
        }

        .workflow-field {
          display: grid;
          gap: 6px;
          color: var(--text-secondary);
          font-size: 0.86rem;
          font-weight: 700;
        }

        .workflow-field small,
        .workflow-disabled-note {
          color: var(--text-tertiary);
          font-weight: 500;
          line-height: 1.4;
        }

        .workflow-disabled-note {
          padding: 10px 12px;
          border: 1px dashed var(--border);
          border-radius: 8px;
        }

        @media (max-width: 980px) {
          .workflow-studio {
            height: auto;
            min-height: 100%;
            overflow: auto;
          }

          .workflow-toolbar {
            flex-direction: column;
          }

          .workflow-builder-grid {
            display: flex;
            flex-direction: column;
            overflow: visible;
          }

          .workflow-pane {
            max-height: none;
            overflow: visible;
          }

          .workflow-meta-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
