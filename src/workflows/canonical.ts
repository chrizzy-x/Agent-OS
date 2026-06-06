import { ValidationError } from '../utils/errors.js';

export type WorkflowAuthoringMode = 'conversation' | 'visual' | 'code';

export type WorkflowStep = {
  order: number;
  tool: string;
  description: string;
  input: Record<string, unknown>;
};

export type WorkflowGraphNode = {
  id: string;
  type: 'step' | 'trigger' | 'condition' | 'output';
  label: string;
  tool: string;
  description: string;
  input: Record<string, unknown>;
  order: number;
  position?: { x: number; y: number };
};

export type WorkflowGraphEdge = {
  id: string;
  source: string;
  target: string;
  condition: string | null;
};

export type WorkflowGraphState = {
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
};

export type CanonicalWorkflowDocument = {
  schemaVersion: '1.0.0';
  updatedFrom: WorkflowAuthoringMode;
  updatedAt: string;
  steps: WorkflowStep[];
  graph: WorkflowGraphState;
  metadata: Record<string, unknown>;
};

export type WorkflowSyncResult = {
  canonical: CanonicalWorkflowDocument;
  steps: WorkflowStep[];
  graphState: WorkflowGraphState;
  codeState: string;
};

export type SyncWorkflowInput = {
  mode: WorkflowAuthoringMode;
  steps?: unknown;
  graph?: unknown;
  code?: string;
  metadata?: Record<string, unknown>;
  now?: string;
};

const MAX_STEPS = 200;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeToolName(tool: string): string {
  const trimmed = tool.trim();
  if (!trimmed) throw new ValidationError('Workflow step tool is required');
  if (
    trimmed.startsWith('agentos.')
    || trimmed.startsWith('mcp.')
    || trimmed.startsWith('skill.')
  ) {
    return trimmed;
  }
  return `agentos.${trimmed}`;
}

function normalizeStep(raw: unknown, fallbackOrder: number): WorkflowStep {
  const row = asRecord(raw);
  const providedOrder = asNumber(row.order);
  const order = providedOrder && providedOrder > 0 ? Math.floor(providedOrder) : fallbackOrder;
  const toolRaw = typeof row.tool === 'string' ? row.tool : '';
  const descriptionRaw = typeof row.description === 'string' ? row.description.trim() : '';
  return {
    order,
    tool: normalizeToolName(toolRaw),
    description: descriptionRaw || `Step ${order}`,
    input: asRecord(row.input),
  };
}

export function normalizeWorkflowSteps(raw: unknown): WorkflowStep[] {
  if (!Array.isArray(raw)) throw new ValidationError('Workflow steps must be an array');
  if (raw.length === 0) throw new ValidationError('Workflow steps must include at least one step');
  if (raw.length > MAX_STEPS) throw new ValidationError(`Workflow steps exceed maximum size (${MAX_STEPS})`);

  const steps = raw.map((item, index) => normalizeStep(item, index + 1));
  steps.sort((left, right) => left.order - right.order);
  return steps.map((step, index) => ({ ...step, order: index + 1 }));
}

function normalizeGraphNode(raw: unknown, fallbackIndex: number): WorkflowGraphNode {
  const row = asRecord(raw);
  const idRaw = typeof row.id === 'string' ? row.id.trim() : '';
  const orderRaw = asNumber(row.order);
  const order = orderRaw && orderRaw > 0 ? Math.floor(orderRaw) : fallbackIndex + 1;
  const typeRaw = typeof row.type === 'string' ? row.type.trim().toLowerCase() : 'step';
  const type = typeRaw === 'trigger' || typeRaw === 'condition' || typeRaw === 'output' ? typeRaw : 'step';
  const label = typeof row.label === 'string' && row.label.trim() ? row.label.trim() : `Step ${order}`;
  const tool = normalizeToolName(typeof row.tool === 'string' ? row.tool : '');
  const description = typeof row.description === 'string' && row.description.trim() ? row.description.trim() : label;
  const input = asRecord(row.input);
  const positionRecord = asRecord(row.position);
  const px = asNumber(positionRecord.x);
  const py = asNumber(positionRecord.y);

  return {
    id: idRaw || `step-${order}`,
    type,
    label,
    tool,
    description,
    input,
    order,
    position: px !== null && py !== null ? { x: px, y: py } : undefined,
  };
}

function normalizeGraphEdge(raw: unknown, fallbackIndex: number): WorkflowGraphEdge | null {
  const row = asRecord(raw);
  const source = typeof row.source === 'string' ? row.source.trim() : '';
  const target = typeof row.target === 'string' ? row.target.trim() : '';
  if (!source || !target) return null;
  const idRaw = typeof row.id === 'string' ? row.id.trim() : '';
  const condition = typeof row.condition === 'string' && row.condition.trim() ? row.condition.trim() : null;
  return {
    id: idRaw || `edge-${fallbackIndex + 1}`,
    source,
    target,
    condition,
  };
}

function stepsToGraph(steps: WorkflowStep[]): WorkflowGraphState {
  const nodes = steps.map((step, index) => ({
    id: `step-${step.order}`,
    type: 'step' as const,
    label: step.description || `Step ${step.order}`,
    tool: step.tool,
    description: step.description,
    input: step.input,
    order: step.order,
    position: { x: 80 + (index * 180), y: 120 },
  }));
  const edges = nodes.slice(1).map((node, index) => ({
    id: `edge-${index + 1}`,
    source: nodes[index].id,
    target: node.id,
    condition: null,
  }));
  return { nodes, edges };
}

function orderNodesByEdges(nodes: WorkflowGraphNode[], edges: WorkflowGraphEdge[]): WorkflowGraphNode[] {
  const nodeMap = new Map(nodes.map(node => [node.id, node]));
  const outgoing = new Map<string, string[]>();
  const incomingCount = new Map<string, number>();
  for (const node of nodes) incomingCount.set(node.id, 0);

  for (const edge of edges) {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) continue;
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
  }

  const queue = [...nodes]
    .filter(node => (incomingCount.get(node.id) ?? 0) === 0)
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  const ordered: WorkflowGraphNode[] = [];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current.id)) continue;
    seen.add(current.id);
    ordered.push(current);
    for (const nextId of outgoing.get(current.id) ?? []) {
      const remaining = (incomingCount.get(nextId) ?? 1) - 1;
      incomingCount.set(nextId, remaining);
      if (remaining === 0) {
        const nextNode = nodeMap.get(nextId);
        if (nextNode) queue.push(nextNode);
      }
    }
    queue.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  }

  if (ordered.length < nodes.length) {
    const remainder = nodes
      .filter(node => !seen.has(node.id))
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
    ordered.push(...remainder);
  }

  return ordered;
}

function graphToSteps(graph: WorkflowGraphState): WorkflowStep[] {
  if (graph.nodes.length === 0) throw new ValidationError('Workflow graph must contain at least one node');
  const ordered = orderNodesByEdges(graph.nodes, graph.edges).filter(node => node.type === 'step');
  if (ordered.length === 0) throw new ValidationError('Workflow graph must contain at least one executable step node');
  return ordered.map((node, index) => ({
    order: index + 1,
    tool: normalizeToolName(node.tool),
    description: node.description || node.label || `Step ${index + 1}`,
    input: asRecord(node.input),
  }));
}

function normalizeGraph(raw: unknown): WorkflowGraphState {
  const source = asRecord(raw);
  const rawNodes = Array.isArray(source.nodes) ? source.nodes : [];
  if (rawNodes.length === 0) throw new ValidationError('Workflow graph must include nodes');
  if (rawNodes.length > MAX_STEPS) throw new ValidationError(`Workflow graph exceeds maximum size (${MAX_STEPS})`);
  const nodes = rawNodes.map((node, index) => normalizeGraphNode(node, index));
  const rawEdges = Array.isArray(source.edges) ? source.edges : [];
  const edges = rawEdges
    .map((edge, index) => normalizeGraphEdge(edge, index))
    .filter((edge): edge is WorkflowGraphEdge => edge !== null);
  return { nodes, edges };
}

function parseWorkflowCode(code: string): Record<string, unknown> {
  if (!code.trim()) throw new ValidationError('Workflow code payload is required');
  let parsed: unknown;
  try {
    parsed = JSON.parse(code);
  } catch {
    throw new ValidationError('Workflow code must be valid JSON');
  }
  const doc = asRecord(parsed);
  if (!doc || Array.isArray(parsed)) throw new ValidationError('Workflow code must decode to an object');
  return doc;
}

function fromConversation(input: SyncWorkflowInput): WorkflowSyncResult {
  const steps = normalizeWorkflowSteps(input.steps);
  const graph = stepsToGraph(steps);
  const canonical: CanonicalWorkflowDocument = {
    schemaVersion: '1.0.0',
    updatedFrom: 'conversation',
    updatedAt: input.now ?? new Date().toISOString(),
    steps,
    graph,
    metadata: input.metadata ?? {},
  };
  return {
    canonical,
    steps,
    graphState: graph,
    codeState: serializeWorkflowCode(canonical),
  };
}

function fromVisual(input: SyncWorkflowInput): WorkflowSyncResult {
  const graph = normalizeGraph(input.graph);
  const steps = graphToSteps(graph);
  const normalizedGraph = stepsToGraph(steps);
  const canonical: CanonicalWorkflowDocument = {
    schemaVersion: '1.0.0',
    updatedFrom: 'visual',
    updatedAt: input.now ?? new Date().toISOString(),
    steps,
    graph: normalizedGraph,
    metadata: input.metadata ?? {},
  };
  return {
    canonical,
    steps,
    graphState: normalizedGraph,
    codeState: serializeWorkflowCode(canonical),
  };
}

function fromCode(input: SyncWorkflowInput): WorkflowSyncResult {
  const parsed = parseWorkflowCode(input.code ?? '');
  const parsedSteps = Array.isArray(parsed.steps) ? parsed.steps : null;
  const parsedGraph = parsed.graph && typeof parsed.graph === 'object'
    ? parsed.graph
    : { nodes: parsed.nodes, edges: parsed.edges };
  const baseGraph = asRecord(parsedGraph);
  const graphLooksValid = Array.isArray(baseGraph.nodes) && baseGraph.nodes.length > 0;

  if (!parsedSteps && !graphLooksValid) {
    throw new ValidationError('Workflow code must define either steps[] or graph/nodes+edges');
  }

  const normalized = parsedSteps
    ? fromConversation({ ...input, mode: 'conversation', steps: parsedSteps })
    : fromVisual({ ...input, mode: 'visual', graph: parsedGraph });

  normalized.canonical.updatedFrom = 'code';
  normalized.canonical.updatedAt = input.now ?? new Date().toISOString();
  normalized.canonical.metadata = {
    ...normalized.canonical.metadata,
    parsedVersion: typeof parsed.version === 'string' ? parsed.version : '1.0.0',
  };
  normalized.codeState = serializeWorkflowCode(normalized.canonical);
  return normalized;
}

export function syncWorkflowDocument(input: SyncWorkflowInput): WorkflowSyncResult {
  if (input.mode === 'conversation') return fromConversation(input);
  if (input.mode === 'visual') return fromVisual(input);
  return fromCode(input);
}

export function serializeWorkflowCode(document: CanonicalWorkflowDocument): string {
  return JSON.stringify({
    version: document.schemaVersion,
    metadata: document.metadata,
    steps: document.steps,
    graph: {
      nodes: document.graph.nodes,
      edges: document.graph.edges,
    },
  }, null, 2);
}

export function parseCanonicalWorkflowDocument(raw: unknown): CanonicalWorkflowDocument | null {
  const row = asRecord(raw);
  if (!row || Object.keys(row).length === 0) return null;

  try {
    const steps = normalizeWorkflowSteps(row.steps);
    const graph = normalizeGraph(row.graph);
    return {
      schemaVersion: '1.0.0',
      updatedFrom: row.updatedFrom === 'visual' || row.updatedFrom === 'code' ? row.updatedFrom : 'conversation',
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : new Date().toISOString(),
      steps,
      graph: stepsToGraph(graphToSteps(graph)),
      metadata: asRecord(row.metadata),
    };
  } catch {
    return null;
  }
}

export function hydrateWorkflowDocument(params: {
  canonicalDoc?: unknown;
  steps?: unknown;
  graphState?: unknown;
  codeState?: string | null;
}): WorkflowSyncResult {
  const parsedCanonical = parseCanonicalWorkflowDocument(params.canonicalDoc);
  if (parsedCanonical) {
    return {
      canonical: parsedCanonical,
      steps: parsedCanonical.steps,
      graphState: parsedCanonical.graph,
      codeState: params.codeState?.trim() ? params.codeState : serializeWorkflowCode(parsedCanonical),
    };
  }

  if (params.codeState?.trim()) {
    return syncWorkflowDocument({
      mode: 'code',
      code: params.codeState,
    });
  }

  if (params.graphState) {
    return syncWorkflowDocument({
      mode: 'visual',
      graph: params.graphState,
    });
  }

  return syncWorkflowDocument({
    mode: 'conversation',
    steps: params.steps ?? [],
  });
}
