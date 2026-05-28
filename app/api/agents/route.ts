import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { getExternalAgentRegistration, listExternalAgents, registerExternalAgent } from '@/src/external-agents/service';
import { toErrorResponse, PermissionError, ValidationError } from '@/src/utils/errors';
import crypto from 'crypto';

export const runtime = 'nodejs';

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 34) || 'agent';
}

async function ownsAgent(agentId: string, ownerAgentId: string): Promise<boolean> {
  const owner = ownerAgentId.toLowerCase();
  let current = await getExternalAgentRegistration(agentId);
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (current.owner_email === owner) return true;
    if (!current.owner_email) return false;
    current = await getExternalAgentRegistration(current.owner_email);
  }
  return false;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = requireAgentContext(request.headers);
    const agents = await listExternalAgents(ctx.agentId);
    return NextResponse.json({ agents });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = requireAgentContext(request.headers);
    const body = await request.json() as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const parentAgentId = typeof body.parentAgentId === 'string' ? body.parentAgentId.trim() : '';

    if (!name) throw new ValidationError('name is required');

    let ownerEmail = ctx.agentId;
    if (parentAgentId) {
      const parent = await getExternalAgentRegistration(parentAgentId);
      if (!parent || !await ownsAgent(parentAgentId, ctx.agentId)) {
        throw new PermissionError('Parent agent not found');
      }
      ownerEmail = parent.agent_id;
    }

    const suffix = crypto.randomBytes(4).toString('hex');
    const result = await registerExternalAgent({
      agentId: `${slugify(name)}-${suffix}`,
      name,
      description: description || null,
      ownerEmail,
      allowedDomains: ['*'],
      allowedTools: [],
    });

    return NextResponse.json({
      agent: {
        agent_id: result.agentId,
        name,
        description: description || null,
        owner_email: ownerEmail,
        allowed_domains: result.allowedDomains,
        allowed_tools: result.allowedTools,
        status: 'active',
        total_calls: 0,
        last_active_at: null,
        created_at: new Date().toISOString(),
      },
      agentId: result.agentId,
      apiKey: result.token,
    }, { status: 201 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
