import { hydrateWorkflowDocument } from '../workflows/canonical.js';

export type RuntimeSubjectLink = {
  id: string;
  name: string;
  href: string;
  updatedAt: string | null;
};

export type RuntimeSubjectLinks = {
  apps: RuntimeSubjectLink[];
  workflows: RuntimeSubjectLink[];
  skills: RuntimeSubjectLink[];
};

export type ConnectorPermissionScope = {
  studio: boolean;
  apps: boolean;
  workflows: boolean;
  skills: boolean;
  externalAgents: boolean;
  requiresConsensus: boolean;
};

export type ConnectorLastAuditOutcome = {
  success: boolean;
  timestamp: string | null;
  errorMessage: string | null;
  tool: string | null;
} | null;

export type IntrospectionDataset = {
  apps: Array<Record<string, unknown>>;
  workflows: Array<Record<string, unknown>>;
  skills: Array<Record<string, unknown>>;
};

function stringifyLower(value: unknown): string {
  try {
    return JSON.stringify(value ?? '').toLowerCase();
  } catch {
    return String(value ?? '').toLowerCase();
  }
}

function uniqueLinks(items: RuntimeSubjectLink[]): RuntimeSubjectLink[] {
  const map = new Map<string, RuntimeSubjectLink>();
  for (const item of items) {
    if (!map.has(item.id)) map.set(item.id, item);
  }
  return [...map.values()];
}

function exactToolTerms(tool: string): string[] {
  const normalized = tool.trim().toLowerCase();
  const terms = new Set<string>([normalized]);
  if (normalized.startsWith('agentos.')) {
    terms.add(normalized.slice('agentos.'.length));
  } else {
    terms.add(`agentos.${normalized}`);
  }
  if (normalized.startsWith('skill.')) {
    terms.add(`agentos.${normalized}`);
  }
  if (normalized.startsWith('mcp.')) {
    terms.add(`agentos.${normalized}`);
  }
  return [...terms];
}

function connectorTerms(slug: string): string[] {
  const normalized = slug.trim().toLowerCase();
  return [
    `mcp.${normalized}.`,
    `"server":"${normalized}"`,
    `"mcp_server":"${normalized}"`,
  ];
}

function matchesAny(text: string, terms: string[]): boolean {
  return terms.some(term => term.length > 0 && text.includes(term));
}

function stringArrayContainsPrimitive(raw: unknown, primitive: string): boolean {
  if (!Array.isArray(raw)) return false;
  return raw.some(item => {
    if (typeof item !== 'string') return false;
    const normalized = item.trim().toLowerCase();
    return normalized === primitive
      || normalized === `${primitive}.*`
      || normalized === `agentos.${primitive}`
      || normalized === `agentos.${primitive}.*`;
  });
}

export function derivePrimitive(tool: string): string {
  return tool.replace(/^agentos\./, '').replace(/^mcp\./, '').split(/[._]/)[0] || 'runtime';
}

function workflowUsesTool(row: Record<string, unknown>, tool: string): boolean {
  const terms = exactToolTerms(tool);
  try {
    const hydrated = hydrateWorkflowDocument({
      canonicalDoc: row.canonical_doc,
      steps: row.steps,
      graphState: row.graph_state,
      codeState: typeof row.code_state === 'string' ? row.code_state : null,
    });
    if (hydrated.steps.some(step => matchesAny(step.tool.toLowerCase(), terms))) {
      return true;
    }
  } catch {
    // Fall through to raw search.
  }

  return matchesAny(stringifyLower({
    steps: row.steps,
    graphState: row.graph_state,
    canonicalDoc: row.canonical_doc,
    codeState: row.code_state,
  }), terms);
}

function workflowUsesConnector(row: Record<string, unknown>, slug: string): boolean {
  const terms = connectorTerms(slug);
  try {
    const hydrated = hydrateWorkflowDocument({
      canonicalDoc: row.canonical_doc,
      steps: row.steps,
      graphState: row.graph_state,
      codeState: typeof row.code_state === 'string' ? row.code_state : null,
    });
    if (hydrated.steps.some(step => matchesAny(step.tool.toLowerCase(), terms))) {
      return true;
    }
  } catch {
    // Fall through to raw search.
  }

  return matchesAny(stringifyLower({
    steps: row.steps,
    graphState: row.graph_state,
    canonicalDoc: row.canonical_doc,
    codeState: row.code_state,
  }), terms);
}

function appUsesTool(row: Record<string, unknown>, tool: string): boolean {
  const primitive = derivePrimitive(tool).toLowerCase();
  if (tool.startsWith('agentos.') && stringArrayContainsPrimitive((row.manifest as Record<string, unknown> | null)?.primitives, primitive)) {
    return true;
  }

  return matchesAny(stringifyLower({
    manifest: row.manifest,
    defaultConfig: row.default_config,
    permissionsRequired: row.permissions_required,
    runtimeType: row.runtime_type,
    kernelProduct: row.kernel_product,
  }), exactToolTerms(tool));
}

function appUsesConnector(row: Record<string, unknown>, slug: string): boolean {
  return matchesAny(stringifyLower({
    manifest: row.manifest,
    defaultConfig: row.default_config,
    permissionsRequired: row.permissions_required,
    runtimeType: row.runtime_type,
    kernelProduct: row.kernel_product,
  }), connectorTerms(slug));
}

function skillUsesTool(row: Record<string, unknown>, tool: string): boolean {
  const primitive = derivePrimitive(tool).toLowerCase();
  if (tool.startsWith('agentos.') && stringArrayContainsPrimitive(row.primitives_required, primitive)) {
    return true;
  }

  return matchesAny(stringifyLower({
    sourceCode: row.source_code,
    capabilities: row.capabilities,
    description: row.description,
  }), exactToolTerms(tool));
}

function skillUsesConnector(row: Record<string, unknown>, slug: string): boolean {
  return matchesAny(stringifyLower({
    sourceCode: row.source_code,
    capabilities: row.capabilities,
    description: row.description,
  }), connectorTerms(slug));
}

function appLink(row: Record<string, unknown>): RuntimeSubjectLink {
  const slug = typeof row.slug === 'string' ? row.slug : String(row.id);
  return {
    id: String(row.id),
    name: typeof row.name === 'string' ? row.name : slug,
    href: `/appstore/${slug}`,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
  };
}

function workflowLink(row: Record<string, unknown>): RuntimeSubjectLink {
  return {
    id: String(row.id),
    name: typeof row.name === 'string' ? row.name : `Workflow ${String(row.id)}`,
    href: `/workflows/${String(row.id)}`,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
  };
}

function skillLink(row: Record<string, unknown>): RuntimeSubjectLink {
  const slug = typeof row.slug === 'string' ? row.slug : String(row.id);
  return {
    id: String(row.id),
    name: typeof row.name === 'string' ? row.name : slug,
    href: `/skills/${slug}`,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
  };
}

export function findRelatedSubjectsForTool(dataset: IntrospectionDataset, tool: string): RuntimeSubjectLinks {
  return {
    apps: uniqueLinks(dataset.apps.filter(row => appUsesTool(row, tool)).map(appLink)),
    workflows: uniqueLinks(dataset.workflows.filter(row => workflowUsesTool(row, tool)).map(workflowLink)),
    skills: uniqueLinks(dataset.skills.filter(row => skillUsesTool(row, tool)).map(skillLink)),
  };
}

export function findRelatedSubjectsForConnector(dataset: IntrospectionDataset, slug: string): RuntimeSubjectLinks {
  return {
    apps: uniqueLinks(dataset.apps.filter(row => appUsesConnector(row, slug)).map(appLink)),
    workflows: uniqueLinks(dataset.workflows.filter(row => workflowUsesConnector(row, slug)).map(workflowLink)),
    skills: uniqueLinks(dataset.skills.filter(row => skillUsesConnector(row, slug)).map(skillLink)),
  };
}

export function buildConnectorPermissionScope(usedBy: RuntimeSubjectLinks, requiresConsensus: boolean): ConnectorPermissionScope {
  return {
    studio: true,
    apps: usedBy.apps.length > 0,
    workflows: usedBy.workflows.length > 0,
    skills: usedBy.skills.length > 0,
    externalAgents: true,
    requiresConsensus,
  };
}

export function buildConnectorAccessSummary(params: {
  usedBy: RuntimeSubjectLinks;
  callCount: number;
  successCount: number;
  requiresConsensus: boolean;
}): string {
  const refs: string[] = [];
  if (params.usedBy.apps.length > 0) refs.push(`${params.usedBy.apps.length} app${params.usedBy.apps.length === 1 ? '' : 's'}`);
  if (params.usedBy.workflows.length > 0) refs.push(`${params.usedBy.workflows.length} workflow${params.usedBy.workflows.length === 1 ? '' : 's'}`);
  if (params.usedBy.skills.length > 0) refs.push(`${params.usedBy.skills.length} skill${params.usedBy.skills.length === 1 ? '' : 's'}`);

  const referenceSummary = refs.length > 0 ? `Referenced by ${refs.join(', ')}.` : 'No app, workflow, or skill references detected yet.';
  const callsSummary = params.callCount > 0
    ? `${params.callCount} recorded call${params.callCount === 1 ? '' : 's'} (${params.successCount} successful).`
    : 'No recorded calls yet.';
  const consensusSummary = params.requiresConsensus ? 'Consensus is required.' : 'Consensus is optional.';
  return `${referenceSummary} ${callsSummary} ${consensusSummary}`;
}
