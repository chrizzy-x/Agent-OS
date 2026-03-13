import { NextResponse } from 'next/server';
import { getFFPClient } from '@/src/ffp/client';

export const runtime = 'nodejs';

export async function GET() {
  const ffp = getFFPClient();
  return NextResponse.json({
    enabled: ffp.config.enabled,
    chainId: ffp.config.chainId || null,
    nodeUrl: ffp.config.nodeUrl || null,
    requireConsensus: ffp.config.requireConsensus,
  });
}
