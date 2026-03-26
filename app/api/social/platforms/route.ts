import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { listSocialPlatformsForAgent } from '@/src/integrations/social/platforms';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const agentContext = requireAgentContext(request.headers);
    const platforms = await listSocialPlatformsForAgent(agentContext.agentId);
    return NextResponse.json({ platforms }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list social platforms';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
