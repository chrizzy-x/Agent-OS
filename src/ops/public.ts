const protectedSummary = 'Detailed health diagnostics require authenticated ops access.';

type CrewPairLike = {
  status: string;
  infra_agent?: {
    name?: string;
    status?: string;
  } | null;
} | null;

type CrewHealthLike = {
  status: string;
  health_score?: number;
  summary?: string;
  [key: string]: unknown;
} | null;

type CrewTaskLike = {
  id: string;
  task_type: string;
  status: string;
};

type CrewOverviewLike = {
  summary: {
    platformFeatures: number;
    runtimeFunctions: number;
    totalCatalogItems: number;
  };
  settings: {
    operation_mode: 'single_agent' | 'multi_agent';
    consensus_mode_enabled: boolean;
  };
  items: Array<{
    feature: {
      slug: string;
      id: number;
      name: string;
      kind: string;
      categoryName: string;
      categoryBadge: string;
      short: string;
    };
    activePair: CrewPairLike;
    standbyPair: CrewPairLike;
    activeHealth: CrewHealthLike;
    standbyHealth: CrewHealthLike;
    openTasks: CrewTaskLike[];
    coverageState: string;
  }>;
};

type OpsMetricsLike = {
  summary: {
    platformFeatures: number;
    runtimeFunctions: number;
    totalCatalogItems: number;
  };
  settings: {
    operation_mode: 'single_agent' | 'multi_agent';
    consensus_mode_enabled: boolean;
  };
  metrics: {
    totalCatalogItems: number;
    fullyCovered: number;
    coveragePercent: number;
    healthyActiveAgents: number;
    degradedActiveAgents: number;
    openTasks: number;
    failoverEvents: number;
  };
};

function redactPair(pair: CrewPairLike, label: string) {
  if (!pair) {
    return null;
  }

  return {
    status: pair.status,
    infra_agent: {
      name: label,
      status: pair.infra_agent?.status ?? pair.status,
    },
  };
}

function redactHealth(health: CrewHealthLike) {
  if (!health) {
    return null;
  }

  return {
    ...health,
    summary: protectedSummary,
  };
}

export function toPublicCrewOverview(overview: CrewOverviewLike) {
  return {
    summary: overview.summary,
    settings: overview.settings,
    requiresAuthForDetails: true,
    items: overview.items.map(item => ({
      feature: item.feature,
      activePair: redactPair(item.activePair, 'Primary coverage'),
      standbyPair: redactPair(item.standbyPair, 'Standby coverage'),
      activeHealth: redactHealth(item.activeHealth),
      standbyHealth: redactHealth(item.standbyHealth),
      openTaskCount: item.openTasks.length,
      coverageState: item.coverageState,
    })),
    failoverEvents: [],
  };
}

export function toPublicOpsMetrics(metrics: OpsMetricsLike) {
  return {
    summary: metrics.summary,
    settings: metrics.settings,
    metrics: metrics.metrics,
    requiresAuthForDetails: true,
  };
}
