import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    enabled: false,
    mode: 'temp',
    chainId: null,
    nodeUrl: null,
    requireConsensus: false,
    consensusAvailable: false,
    message: 'FFP is a temporary workspace routing layer in V6.6.2. No consensus engine is live.',
  });
}
