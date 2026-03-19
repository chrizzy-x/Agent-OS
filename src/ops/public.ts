const protectedSummary = 'Detailed health diagnostics require authenticated ops access.';

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
    coverageState: string;
  }>;
};

type PublicCoverageBreakdown = {
  totalCatalogItems: number;
  fullyCovered: number;
  degradedCoverage: number;
  uncovered: number;
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

export function toPublicCrewOverview(overview: CrewOverviewLike) {
  const coverage = overview.items.reduce<PublicCoverageBreakdown>((acc, item) => {
    acc.totalCatalogItems += 1;

    if (item.coverageState === 'covered') {
      acc.fullyCovered += 1;
    } else if (item.coverageState === 'uncovered') {
      acc.uncovered += 1;
    } else {
      acc.degradedCoverage += 1;
    }

    return acc;
  }, {
    totalCatalogItems: 0,
    fullyCovered: 0,
    degradedCoverage: 0,
    uncovered: 0,
  });

  return {
    summary: overview.summary,
    settings: overview.settings,
    coverage,
    protectedSummary,
    requiresAuthForDetails: true,
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
