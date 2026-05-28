import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAgentContext } from '@/src/auth/request';
import { registerExternalAgent } from '@/src/external-agents/service';
import { toErrorResponse, ValidationError } from '@/src/utils/errors';

export const runtime = 'nodejs';

const TEMPLATES: Record<string, { name: string }> = {
  'research-agent':    { name: 'Research Agent' },
  'trading-monitor':   { name: 'Trading Monitor' },
  'social-manager':    { name: 'Social Manager' },
  'data-pipeline':     { name: 'Data Pipeline' },
  'security-sentinel': { name: 'Security Sentinel' },
  'customer-support':  { name: 'Customer Support' },
};

export async function POST(request: NextRequest) {
  try {
    const ctx = requireAgentContext(request.headers);

    const body = await request.json() as Record<string, unknown>;
    const templateId = typeof body.template_id === 'string' ? body.template_id : '';
    const template = TEMPLATES[templateId];
    if (!template) {
      throw new ValidationError(`Unknown template_id: ${templateId}`);
    }

    const suffix = crypto.randomBytes(4).toString('hex');
    const agentId = `${templateId}-${suffix}`;

    const result = await registerExternalAgent({
      agentId,
      name: `${template.name} ${suffix}`,
      allowedDomains: ['*'],
      allowedTools: [],
      ownerEmail: ctx.agentId,
    });

    return NextResponse.json({ agentId: result.agentId, apiKey: result.token });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
