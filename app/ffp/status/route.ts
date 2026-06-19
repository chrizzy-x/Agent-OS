import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    enabled: false,
    mode: 'coming_soon',
    chainId: null,
    nodeUrl: null,
    requireConsensus: false,
    consensusAvailable: false,
    message: 'FFP is disabled and Coming Soon in AgentOS v6.6.3.',
  });
}
