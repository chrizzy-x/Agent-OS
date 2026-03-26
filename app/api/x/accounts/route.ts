import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { listXAccountsForAgent } from '@/src/integrations/x/service';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const agentContext = requireAgentContext(request.headers);
    const accounts = await listXAccountsForAgent(agentContext.agentId);
    return NextResponse.json({ accounts }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list X accounts';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}