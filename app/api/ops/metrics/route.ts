import { NextRequest, NextResponse } from 'next/server';
import { hasOpsAdminAccess } from '@/src/auth/request';
import { getOpsMetrics } from '@/src/ops/service';
import { toPublicOpsMetrics } from '@/src/ops/public';
import { getFeatureCoverageSummary } from '@/src/catalog/feature-catalog';
import { TOOLS } from '@/src/tools';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

function buildFallbackMetrics() {
  return {
    summary: getFeatureCoverageSummary(),
    settings: {
      operation_mode: 'single_agent' as const,
      consensus_mode_enabled: false,
    },
    metrics: {
      totalCatalogItems: getFeatureCoverageSummary().totalCatalogItems,
      fullyCovered: Object.keys(TOOLS).length,
      coveragePercent: Number(((Object.keys(TOOLS).length / Math.max(getFeatureCoverageSummary().totalCatalogItems, 1)) * 100).toFixed(2)),
      healthyActiveAgents: 1,
      degradedActiveAgents: 0,
      openTasks: 0,
      failoverEvents: 0,
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const metrics = await getOpsMetrics();
    const canViewInternalDetails = await hasOpsAdminAccess(request.headers);
    return NextResponse.json(canViewInternalDetails ? metrics : toPublicOpsMetrics(metrics));
  } catch (error: unknown) {
    const fallback = buildFallbackMetrics();
    try {
      const canViewInternalDetails = await hasOpsAdminAccess(request.headers);
      return NextResponse.json(canViewInternalDetails ? fallback : toPublicOpsMetrics(fallback));
    } catch {
      return NextResponse.json(toPublicOpsMetrics(fallback));
    }
  }
}

