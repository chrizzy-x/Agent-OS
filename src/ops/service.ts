import crypto from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { isFfpEnabled } from '../config/env.js';
import {
  FULL_CATALOG,
  PROJECT_DETAILS,
  getFeatureCoverageSummary,
  type FeatureCatalogItem,
} from '../catalog/feature-catalog.js';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { TOOLS } from '../tools.js';
import { ValidationError } from '../utils/errors.js';

const heartbeatStaleMs = 15 * 60 * 1000;
const defaultSettings: {
  scope: string;
  operation_mode: 'single_agent' | 'multi_agent';
  consensus_mode_enabled: boolean;
} = {
  scope: 'global',
  operation_mode: 'single_agent',
  consensus_mode_enabled: false,
};

type PairRole = 'active' | 'standby';
type CrewStatus = 'healthy' | 'warning' | 'degraded' | 'failed';

type CrewSettingsRow = {
  scope: string;
  operation_mode: 'single_agent' | 'multi_agent';
  consensus_mode_enabled: boolean;
  updated_at?: string;
};

type InfraAgentRow = {
  id: string;
  name: string;
  role: string;
  specialty: string;
  status: string;
  heartbeat_at?: string | null;
  health_score?: number | null;
  metadata?: Record<string, unknown> | null;
};

type PairRow = {
  id: string;
  feature_slug: string;
  infra_agent_id: string;
  role: PairRole;
  status: string;
  assigned_at: string;
  last_failover_at?: string | null;
  metadata?: Record<string, unknown> | null;
  infra_agent?: InfraAgentRow | null;
};

type SnapshotRow = {
  feature_slug: string;
  infra_agent_id: string;
  role: PairRole;
  status: CrewStatus;
  health_score: number;
  summary: string;
  metrics: Record<string, unknown>;
  created_at: string;
};

type TaskRow = {
  id: string;
  feature_slug: string;
  status: string;
  task_type: string;
  last_error?: string | null;
  scheduled_for: string;
  created_at: string;
};

type HealthSignals = {
  hasSupabase: boolean;
  hasRedis: boolean;
  hasAnthropic: boolean;
  ffpEnabled: boolean;
  activeMcpServers: number;
};

let anthropicClient: Anthropic | null = null;

function sanitizeSlug(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase();
}

function clampScore(score: number): number {
  return Math.max(0.05, Math.min(1, Number(score.toFixed(2))));
}

function statusFromScore(score: number): CrewStatus {
  if (score >= 0.85) return 'healthy';
  if (score >= 0.6) return 'warning';
  if (score >= 0.35) return 'degraded';
  return 'failed';
}

function toCatalogRow(item: FeatureCatalogItem) {
  return {
    slug: item.slug,
    id: item.id,
    name: item.name,
    kind: item.kind,
    category_name: item.categoryName,
    category_badge: item.categoryBadge,
    category_description: item.categoryDescription,
    summary: item.short,
    details: item.details,
    competitor: item.competitor,
    standout: item.standout,
    use_cases: item.useCases,
    metadata: {
      group: item.group,
      kind: item.kind,
      source: 'catalog',
    },
    updated_at: new Date().toISOString(),
  };
}

function buildInfraAgent(feature: FeatureCatalogItem, role: PairRole) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const id = `infra_${sanitizeSlug(feature.slug)}_${role}_${suffix}`;
  return {
    id,
    name: `${feature.name} ${role === 'active' ? 'Primary' : 'Standby'}`,
    role,
    specialty: feature.name,
    status: 'healthy',
    heartbeat_at: new Date().toISOString(),
    health_score: 1,
    metadata: {
      featureSlug: feature.slug,
      category: feature.categoryName,
      kind: feature.kind,
    },
  };
}

async function getAnthropicClient(): Promise<Anthropic | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return null;
  }

  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  return anthropicClient;
}

async function maybeGenerateTriageSuggestion(feature: FeatureCatalogItem, summary: string): Promise<string | null> {
  const client = await getAnthropicClient();
  if (!client) {
    return null;
  }

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 160,
    messages: [{
      role: 'user',
      content: `You are triaging an Agent OS operations incident.\nFeature: ${feature.name}\nSummary: ${summary}\nReturn two short remediation actions in plain English.`,
    }],
  });

  const first = response.content[0];
  return first && first.type === 'text' ? first.text : null;
}

export async function syncFeatureCatalog() {
  const supabase = getSupabaseAdmin();
  await supabase.from('feature_catalog').upsert(FULL_CATALOG.map(toCatalogRow), { onConflict: 'slug' });
  return getFeatureCoverageSummary();
}

export async function getCrewSettings(): Promise<CrewSettingsRow> {
  const supabase = getSupabaseAdmin();
  await supabase.from('crew_settings').upsert(defaultSettings, { onConflict: 'scope', ignoreDuplicates: true });

  const { data } = await supabase
    .from('crew_settings')
    .select('*')
    .eq('scope', 'global')
    .single();

  return (data as CrewSettingsRow | null) ?? defaultSettings;
}

export async function updateCrewSettings(input: {
  operationMode?: 'single_agent' | 'multi_agent';
  consensusModeEnabled?: boolean;
}) {
  const current = await getCrewSettings();
  const nextMode = input.operationMode ?? current.operation_mode;
  const nextConsensus = input.consensusModeEnabled ?? current.consensus_mode_enabled;

  if (!['single_agent', 'multi_agent'].includes(nextMode)) {
    throw new ValidationError('operationMode must be single_agent or multi_agent');
  }

  if (nextConsensus && nextMode !== 'multi_agent') {
    throw new ValidationError('Consensus mode can only be enabled for multi-agent operations');
  }

  if (nextConsensus && !isFfpEnabled()) {
    throw new ValidationError('FFP mode is disabled for this deployment');
  }

  const supabase = getSupabaseAdmin();
  const payload = {
    scope: 'global',
    operation_mode: nextMode,
    consensus_mode_enabled: nextConsensus,
    updated_at: new Date().toISOString(),
  };

  await supabase.from('crew_settings').upsert(payload, { onConflict: 'scope' });
  return getCrewSettings();
}

export async function ensureCrewCoverage() {
  await syncFeatureCatalog();
  const supabase = getSupabaseAdmin();

  const { data: pairs } = await supabase
    .from('feature_agent_pairs')
    .select('feature_slug, role');

  const existing = new Set((pairs ?? []).map(pair => `${pair.feature_slug}:${pair.role}`));
  const created: { featureSlug: string; role: PairRole; agentId: string }[] = [];

  for (const feature of FULL_CATALOG) {
    for (const role of ['active', 'standby'] as const) {
      const key = `${feature.slug}:${role}`;
      if (existing.has(key)) {
        continue;
      }

      const agent = buildInfraAgent(feature, role);
      await supabase.from('infra_agents').insert(agent);
      await supabase.from('feature_agent_pairs').insert({
        feature_slug: feature.slug,
        infra_agent_id: agent.id,
        role,
        status: 'healthy',
        metadata: { bootstrap: true },
      });

      existing.add(key);
      created.push({ featureSlug: feature.slug, role, agentId: agent.id });
    }
  }

  return {
    ...getFeatureCoverageSummary(),
    createdPairs: created.length,
    created,
  };
}

async function getHealthSignals(): Promise<HealthSignals> {
  const supabase = getSupabaseAdmin();
  const { count } = await supabase
    .from('mcp_servers')
    .select('id', { count: 'exact', head: true })
    .eq('active', true);

  return {
    hasSupabase: true,
    hasRedis: Boolean(process.env.REDIS_URL),
    hasAnthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    ffpEnabled: isFfpEnabled(),
    activeMcpServers: count ?? 0,
  };
}

function evaluatePairHealth(feature: FeatureCatalogItem, pair: PairRow | undefined, signals: HealthSignals) {
  if (!pair?.infra_agent) {
    return { score: 0.1, status: 'failed' as CrewStatus, summary: 'Coverage slot is missing an assigned agent.' };
  }

  let score = 1;
  const reasons: string[] = [];
  const heartbeat = pair.infra_agent.heartbeat_at ? new Date(pair.infra_agent.heartbeat_at).getTime() : 0;

  if (!heartbeat || Date.now() - heartbeat > heartbeatStaleMs) {
    score -= 0.45;
    reasons.push('Heartbeat is stale.');
  }

  if (pair.status === 'failed' || pair.infra_agent.status === 'failed') {
    score -= 0.65;
    reasons.push('Agent is marked failed.');
  }

  if ((feature.group === 'mem' || feature.group === 'events' || feature.slug === 'rate-limiting') && !signals.hasRedis) {
    score -= 0.35;
    reasons.push('Redis is not configured.');
  }

  if (['core', 'skills', 'mcp', 'ui', 'ops', 'infra'].includes(feature.group) && !signals.hasSupabase) {
    score -= 0.35;
    reasons.push('Supabase is not configured.');
  }

  if ((feature.group === 'ffp' || feature.slug === 'reputation-weighting' || feature.slug === 'multi-stage-workflows') && !signals.ffpEnabled) {
    score -= 0.25;
    reasons.push('FFP mode is disabled.');
  }

  if (feature.group === 'mcp' && signals.activeMcpServers === 0) {
    score -= 0.35;
    reasons.push('No active MCP servers are registered.');
  }

  if (feature.slug === 'error-triage' && !signals.hasAnthropic) {
    score -= 0.15;
    reasons.push('Anthropic API key is not configured for triage assistance.');
  }

  if (feature.kind === 'runtime_function' && !(feature.slug in TOOLS)) {
    score -= 0.7;
    reasons.push('Runtime function is missing from the live tool registry.');
  }

  const finalScore = clampScore(score);
  const status = statusFromScore(finalScore);
  const summary = reasons.length > 0 ? reasons.join(' ') : 'Healthy coverage confirmed.';

  return { score: finalScore, status, summary };
}

async function createHealthSnapshot(feature: FeatureCatalogItem, pair: PairRow, signals: HealthSignals) {
  const supabase = getSupabaseAdmin();
  const evaluation = evaluatePairHealth(feature, pair, signals);
  const now = new Date().toISOString();

  await supabase.from('infra_agents').update({
    heartbeat_at: now,
    health_score: evaluation.score,
    status: evaluation.status,
    updated_at: now,
  }).eq('id', pair.infra_agent_id);

  await supabase.from('feature_agent_pairs').update({
    status: evaluation.status,
    metadata: {
      ...(pair.metadata ?? {}),
      lastHealthSummary: evaluation.summary,
      lastHealthScore: evaluation.score,
    },
  }).eq('id', pair.id);

  await supabase.from('crew_health_snapshots').insert({
    feature_slug: pair.feature_slug,
    infra_agent_id: pair.infra_agent_id,
    role: pair.role,
    status: evaluation.status,
    health_score: evaluation.score,
    summary: evaluation.summary,
    metrics: {
      activeMcpServers: signals.activeMcpServers,
      ffpEnabled: signals.ffpEnabled,
      hasRedis: signals.hasRedis,
      hasAnthropic: signals.hasAnthropic,
    },
  });

  return evaluation;
}

async function insertCrewTask(task: {
  featureSlug: string;
  infraAgentId?: string;
  taskType: string;
  status: string;
  priority?: number;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown>;
  lastError?: string;
}) {
  const supabase = getSupabaseAdmin();
  await supabase.from('crew_tasks').insert({
    feature_slug: task.featureSlug,
    infra_agent_id: task.infraAgentId ?? null,
    task_type: task.taskType,
    status: task.status,
    priority: task.priority ?? 100,
    payload: task.payload ?? {},
    result: task.result ?? null,
    last_error: task.lastError ?? null,
    scheduled_for: new Date().toISOString(),
    started_at: new Date().toISOString(),
    completed_at: task.status === 'completed' ? new Date().toISOString() : null,
  });
}

export async function performFailover(featureSlug: string, reason: string, triggeredBy = 'system') {
  await ensureCrewCoverage();
  const supabase = getSupabaseAdmin();

  const feature = FULL_CATALOG.find(item => item.slug === featureSlug);
  if (!feature) {
    throw new ValidationError(`Unknown feature slug '${featureSlug}'`);
  }

  const { data: pairs } = await supabase
    .from('feature_agent_pairs')
    .select('*, infra_agent:infra_agents(*)')
    .eq('feature_slug', featureSlug);

  const activePair = (pairs ?? []).find((pair: PairRow) => pair.role === 'active') as PairRow | undefined;
  const standbyPair = (pairs ?? []).find((pair: PairRow) => pair.role === 'standby') as PairRow | undefined;

  if (!activePair || !standbyPair) {
    throw new ValidationError(`Feature '${featureSlug}' is missing active or standby coverage`);
  }

  const promotedAgentId = standbyPair.infra_agent_id;
  const retiredAgentId = activePair.infra_agent_id;
  const newStandbyAgent = buildInfraAgent(feature, 'standby');
  const now = new Date().toISOString();

  await supabase.from('infra_agents').insert(newStandbyAgent);
  await supabase.from('feature_agent_pairs').update({
    infra_agent_id: newStandbyAgent.id,
    status: 'healthy',
    last_failover_at: now,
    metadata: { reprovisionedAt: now, previousAgentId: promotedAgentId },
  }).eq('id', standbyPair.id);

  await supabase.from('feature_agent_pairs').update({
    infra_agent_id: promotedAgentId,
    status: 'healthy',
    last_failover_at: now,
    metadata: { promotedAt: now, previousAgentId: retiredAgentId },
  }).eq('id', activePair.id);

  await supabase.from('infra_agents').update({ role: 'retired', status: 'failed', updated_at: now }).eq('id', retiredAgentId);
  await supabase.from('infra_agents').update({ role: 'active', status: 'healthy', heartbeat_at: now, updated_at: now }).eq('id', promotedAgentId);
  await supabase.from('infra_agents').update({ role: 'standby', status: 'healthy', heartbeat_at: now, updated_at: now }).eq('id', newStandbyAgent.id);

  await supabase.from('crew_failover_events').insert({
    feature_slug: featureSlug,
    from_agent_id: retiredAgentId,
    to_agent_id: promotedAgentId,
    reason,
    triggered_by: triggeredBy,
    metadata: { newStandbyAgentId: newStandbyAgent.id },
  });

  await insertCrewTask({
    featureSlug,
    infraAgentId: promotedAgentId,
    taskType: 'failover',
    status: 'completed',
    priority: 10,
    payload: { reason, triggeredBy },
    result: { promotedAgentId, newStandbyAgentId: newStandbyAgent.id, retiredAgentId },
  });

  return {
    featureSlug,
    promotedAgentId,
    newStandbyAgentId: newStandbyAgent.id,
    retiredAgentId,
    triggeredBy,
  };
}

export async function runCrewCron() {
  const coverage = await ensureCrewCoverage();
  const settings = await getCrewSettings();
  const signals = await getHealthSignals();
  const overview = await getCrewOverview();
  const actions: Record<string, unknown>[] = [];

  for (const item of overview.items) {
    let activeEval: { score: number; status: CrewStatus; summary: string } | null = null;
    let standbyEval: { score: number; status: CrewStatus; summary: string } | null = null;

    if (item.activePair) {
      activeEval = await createHealthSnapshot(item.feature, item.activePair, signals);
      await insertCrewTask({
        featureSlug: item.feature.slug,
        infraAgentId: item.activePair.infra_agent_id,
        taskType: 'health_check',
        status: 'completed',
        payload: { role: 'active' },
        result: { status: activeEval.status, score: activeEval.score },
      });

      if (activeEval.status === 'degraded' || activeEval.status === 'failed') {
        const triage = await maybeGenerateTriageSuggestion(item.feature, activeEval.summary);
        await insertCrewTask({
          featureSlug: item.feature.slug,
          infraAgentId: item.activePair.infra_agent_id,
          taskType: 'incident_triage',
          status: 'completed',
          priority: 20,
          payload: { summary: activeEval.summary },
          result: triage ? { suggestion: triage } : { suggestion: 'No AI triage suggestion available.' },
        });
      }
    }

    if (item.standbyPair) {
      standbyEval = await createHealthSnapshot(item.feature, item.standbyPair, signals);
      await insertCrewTask({
        featureSlug: item.feature.slug,
        infraAgentId: item.standbyPair.infra_agent_id,
        taskType: 'health_check',
        status: 'completed',
        payload: { role: 'standby' },
        result: { status: standbyEval.status, score: standbyEval.score },
      });
    }

    if (
      activeEval &&
      standbyEval &&
      (activeEval.status === 'degraded' || activeEval.status === 'failed') &&
      standbyEval.status === 'healthy'
    ) {
      const failover = await performFailover(item.feature.slug, 'Scheduled health check degraded the active agent', 'cron');
      actions.push({ type: 'failover', ...failover });
    }
  }

  return {
    coverage,
    settings,
    signals,
    actions,
    checkedAt: new Date().toISOString(),
  };
}

export async function getCrewOverview() {
  await ensureCrewCoverage();
  const supabase = getSupabaseAdmin();
  const settings = await getCrewSettings();

  const { data: pairRows } = await supabase
    .from('feature_agent_pairs')
    .select('*, infra_agent:infra_agents(*)');
  const { data: snapshotRows } = await supabase
    .from('crew_health_snapshots')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(2000);
  const { data: taskRows } = await supabase
    .from('crew_tasks')
    .select('id, feature_slug, status, task_type, last_error, scheduled_for, created_at')
    .in('status', ['queued', 'running']);
  const { data: failoverRows } = await supabase
    .from('crew_failover_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  const latestSnapshotByFeatureRole = new Map<string, SnapshotRow>();
  for (const snapshot of (snapshotRows ?? []) as SnapshotRow[]) {
    const key = `${snapshot.feature_slug}:${snapshot.role}`;
    if (!latestSnapshotByFeatureRole.has(key)) {
      latestSnapshotByFeatureRole.set(key, snapshot);
    }
  }

  const items = FULL_CATALOG.map(feature => {
    const pairs = ((pairRows ?? []) as PairRow[]).filter(pair => pair.feature_slug === feature.slug);
    const activePair = pairs.find(pair => pair.role === 'active');
    const standbyPair = pairs.find(pair => pair.role === 'standby');
    const activeHealth = latestSnapshotByFeatureRole.get(`${feature.slug}:active`) ?? null;
    const standbyHealth = latestSnapshotByFeatureRole.get(`${feature.slug}:standby`) ?? null;
    const openTasks = ((taskRows ?? []) as TaskRow[]).filter(task => task.feature_slug === feature.slug);

    return {
      feature,
      activePair: activePair ?? null,
      standbyPair: standbyPair ?? null,
      activeHealth,
      standbyHealth,
      openTasks,
      coverageState: activePair && standbyPair ? 'covered' : 'missing',
    };
  });

  return {
    project: PROJECT_DETAILS,
    summary: getFeatureCoverageSummary(),
    settings,
    items,
    failoverEvents: failoverRows ?? [],
  };
}

export async function getOpsMetrics() {
  const overview = await getCrewOverview();
  const totalItems = overview.items.length;
  const fullyCovered = overview.items.filter(item => item.coverageState === 'covered').length;
  const healthyActive = overview.items.filter(item => item.activeHealth?.status === 'healthy').length;
  const degradedActive = overview.items.filter(item => item.activeHealth && item.activeHealth.status !== 'healthy').length;
  const openTasks = overview.items.reduce((sum, item) => sum + item.openTasks.length, 0);

  return {
    project: overview.project,
    summary: overview.summary,
    settings: overview.settings,
    metrics: {
      totalCatalogItems: totalItems,
      fullyCovered,
      coveragePercent: totalItems === 0 ? 0 : Number(((fullyCovered / totalItems) * 100).toFixed(2)),
      healthyActiveAgents: healthyActive,
      degradedActiveAgents: degradedActive,
      openTasks,
      failoverEvents: overview.failoverEvents.length,
    },
  };
}





