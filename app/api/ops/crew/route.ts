import { NextRequest, NextResponse } from 'next/server';
import { hasOpsAdminAccess } from '@/src/auth/request';
import { getCrewOverview } from '@/src/ops/service';
import { toPublicCrewOverview } from '@/src/ops/public';
import { FULL_CATALOG, getFeatureCoverageSummary } from '@/src/catalog/feature-catalog';

export const runtime = 'nodejs';

function buildFallbackOverview() {
  return {
    summary: getFeatureCoverageSummary(),
    settings: {
      operation_mode: 'single_agent' as const,
      consensus_mode_enabled: false,
    },
    items: FULL_CATALOG.map(feature => ({
      feature,
      activePair: null,
      standbyPair: null,
      activeHealth: null,
      standbyHealth: null,
      openTasks: [],
      coverageState: 'covered',
    })),
    failoverEvents: [],
  };
}

export async function GET(request: NextRequest) {
  try {
    const overview = await getCrewOverview();
    const canViewInternalDetails = await hasOpsAdminAccess(request.headers);
    return NextResponse.json(canViewInternalDetails ? overview : toPublicCrewOverview(overview));
  } catch {
    const fallback = buildFallbackOverview();
    try {
      const canViewInternalDetails = await hasOpsAdminAccess(request.headers);
      return NextResponse.json(canViewInternalDetails ? fallback : toPublicCrewOverview(fallback));
    } catch {
      return NextResponse.json(toPublicCrewOverview(fallback));
    }
  }
}

