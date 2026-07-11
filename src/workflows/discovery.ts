import {
  hydrateWorkflowDocument,
  serializeWorkflowCode,
  type CanonicalWorkflowDocument,
  type WorkflowSyncResult,
  type WorkflowGraphState,
  type WorkflowStep,
} from './canonical.js';

type SanitizeFlags = {
  privateContextRemoved: boolean;
  requiresVaultConfiguration: boolean;
};

type Sanitized<T> = {
  value: T;
  flags: SanitizeFlags;
};

export type SanitizedWorkflowFork = {
  steps: WorkflowStep[];
  graphState: WorkflowGraphState;
  canonicalDoc: CanonicalWorkflowDocument;
  codeState: string;
  privateContextRemoved: boolean;
  requiresVaultConfiguration: boolean;
};

function mergeFlags(flags: SanitizeFlags[]): SanitizeFlags {
  return {
    privateContextRemoved: flags.some(flag => flag.privateContextRemoved),
    requiresVaultConfiguration: flags.some(flag => flag.requiresVaultConfiguration),
  };
}

function normalizedKey(key: string): string {
  return key.replace(/[-_\s]/g, '').toLowerCase();
}

function isSecretKey(key: string): boolean {
  const normalized = normalizedKey(key);
  return normalized.includes('secret')
    || normalized.includes('token')
    || normalized.includes('password')
    || normalized.includes('apikey')
    || normalized.includes('credential')
    || normalized === 'authorization'
    || normalized === 'bearer'
    || normalized.startsWith('vault');
}

function isPrivateContextKey(key: string): boolean {
  return new Set([
    'agentid',
    'owneragentid',
    'ownerid',
    'projectid',
    'sessionid',
    'workspaceid',
  ]).has(normalizedKey(key));
}

function sanitizeUnknown(value: unknown, key = ''): Sanitized<unknown> {
  if (key && isSecretKey(key)) {
    return { value: null, flags: { privateContextRemoved: false, requiresVaultConfiguration: true } };
  }
  if (key && isPrivateContextKey(key)) {
    return { value: null, flags: { privateContextRemoved: true, requiresVaultConfiguration: false } };
  }
  if (Array.isArray(value)) {
    const items = value.map(item => sanitizeUnknown(item));
    return { value: items.map(item => item.value), flags: mergeFlags(items.map(item => item.flags)) };
  }
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    const flags: SanitizeFlags[] = [];
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      const sanitized = sanitizeUnknown(childValue, childKey);
      output[childKey] = sanitized.value;
      flags.push(sanitized.flags);
    }
    return { value: output, flags: mergeFlags(flags) };
  }
  return { value, flags: { privateContextRemoved: false, requiresVaultConfiguration: false } };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function hydrateForkSource(row: Record<string, unknown>): WorkflowSyncResult {
  const codeState = typeof row.code_state === 'string' ? row.code_state : null;
  try {
    return hydrateWorkflowDocument({
      canonicalDoc: row.canonical_doc,
      steps: row.steps,
      graphState: row.graph_state,
      codeState,
    });
  } catch {
    try {
      return hydrateWorkflowDocument({
        canonicalDoc: row.canonical_doc,
        steps: row.steps,
        codeState,
      });
    } catch {
      return hydrateWorkflowDocument({
        steps: row.steps,
        codeState: null,
      });
    }
  }
}

export function sanitizeForkableWorkflow(row: Record<string, unknown>): SanitizedWorkflowFork {
  const hydrated = hydrateForkSource(row);
  const sanitizedSteps = sanitizeUnknown(hydrated.steps) as Sanitized<WorkflowStep[]>;
  const sanitizedGraph = sanitizeUnknown(hydrated.graphState) as Sanitized<WorkflowGraphState>;
  const sanitizedMetadata = sanitizeUnknown(asRecord(hydrated.canonical.metadata)) as Sanitized<Record<string, unknown>>;
  const flags = mergeFlags([sanitizedSteps.flags, sanitizedGraph.flags, sanitizedMetadata.flags]);
  const canonicalDoc: CanonicalWorkflowDocument = {
    ...hydrated.canonical,
    metadata: {
      ...sanitizedMetadata.value,
      forkedFromWorkflowId: String(row.id ?? ''),
      forkedFromName: String(row.name ?? 'Public workflow'),
      forkedAt: new Date().toISOString(),
      monetization: 'not_monetized',
      privateContextRemoved: flags.privateContextRemoved,
      requiresVaultConfiguration: flags.requiresVaultConfiguration,
    },
    steps: sanitizedSteps.value,
    graph: sanitizedGraph.value,
  };
  return {
    steps: canonicalDoc.steps,
    graphState: canonicalDoc.graph,
    canonicalDoc,
    codeState: serializeWorkflowCode(canonicalDoc),
    privateContextRemoved: flags.privateContextRemoved,
    requiresVaultConfiguration: flags.requiresVaultConfiguration,
  };
}
