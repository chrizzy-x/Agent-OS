import { NextRequest, NextResponse } from 'next/server';
import { createAgentToken } from '@/src/auth/agent-identity';
import { issueBrowserSession } from '@/src/auth/browser-auth';
import { hashPassword } from '@/src/auth/password';
import { createAgentAccount, findAccountsByEmail } from '@/src/auth/agent-store';
import { parsePlanSelection, PLAN_LABELS, type AccountType, type AgentPlan } from '@/src/auth/tiers';
import { getPlanDescriptor } from '@/src/auth/capabilities';
import { provisionAgentOSAccount } from '@/src/agentos/provisioning';
import crypto from 'crypto';

export const runtime = 'nodejs';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateAgentId(): string {
  const random = crypto.randomBytes(18).toString('base64url');
  return `agent_${random}`;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json', message: 'Invalid JSON body' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const agentName = typeof body.agentName === 'string' ? body.agentName.trim() : '';
  const accountType = body.accountType === 'enterprise' ? 'enterprise' : body.accountType === 'retail' ? 'retail' : null;
  const planSelectionSkipped = body.planSelectionSkipped === true;
  const selectedPlan = typeof body.selectedPlan === 'string' ? body.selectedPlan : undefined;
  const plan = planSelectionSkipped
    ? 'retail_free'
    : parsePlanSelection(accountType, selectedPlan);

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: 'invalid_email', message: 'Valid email required' }, { status: 400 });
  }

  if (!password || password.length < 8) {
    return NextResponse.json({ error: 'invalid_password', message: 'Password must be at least 8 characters' }, { status: 400 });
  }

  if (!accountType || !plan) {
    return NextResponse.json(
      {
        error: 'invalid_plan',
        message: 'Choose Free, Pro, Enterprise, or Enterprise Max under the matching account type.',
      },
      { status: 400 },
    );
  }

  const existingAccounts = await findAccountsByEmail(email);
  if (existingAccounts.length > 0) {
    return NextResponse.json(
      { error: 'conflict', message: 'An account with this email already exists. Please sign in.' },
      { status: 409 },
    );
  }

  const agentId = generateAgentId();
  const emailName = email.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
  const fallbackName = emailName
    ? `${emailName.replace(/\b\w/g, char => char.toUpperCase())}'s Agent`
    : 'My Agent';
  let name = agentName || fallbackName;
  const passwordHash = await hashPassword(password);
  let created = await createAgentAccount({ id: agentId, name, email, passwordHash, tier: plan, plan, accountType: accountType as AccountType, planSelectionSkipped });

  if (created.duplicate && created.conflictField === 'name' && !agentName) {
    name = `${fallbackName} ${crypto.randomBytes(3).toString('hex')}`;
    created = await createAgentAccount({ id: agentId, name, email, passwordHash, tier: plan, plan, accountType: accountType as AccountType, planSelectionSkipped });
  }

  if (created.duplicate) {
    if (created.conflictField === 'name') {
      return NextResponse.json(
        { error: 'conflict', message: 'That agent name is already taken. Choose a unique agent name.' },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: 'conflict', message: 'An account with this email already exists. Please sign in.' },
      { status: 409 },
    );
  }

  let bearerToken: string;
  try {
    bearerToken = createAgentToken(agentId, { expiresIn: '90d' });
  } catch {
    return NextResponse.json(
      { error: 'credentials_unavailable', message: 'Failed to generate credentials. Please try again.' },
      { status: 400 },
    );
  }

  let provisioning;
  try {
    provisioning = await provisionAgentOSAccount({
      agentId,
      agentName: name,
      email,
      accountType: accountType as AccountType,
      plan: plan as AgentPlan,
    });
  } catch {
    return NextResponse.json(
      { error: 'provisioning_failed', message: 'Account was created but AgentOS provisioning failed. Contact support before signing in.' },
      { status: 500 },
    );
  }

  const planDescriptor = getPlanDescriptor(plan);
  const canIssueBearerToken = planDescriptor.capabilities.includes('use_bearer_token');
  const response = NextResponse.json(
    {
      success: true,
      redirectTo: '/studio',
      provisioning,
      credentials: {
        bearerToken: canIssueBearerToken ? bearerToken : null,
        apiKey: canIssueBearerToken ? bearerToken : null,
        agentName: name,
        tier: plan,
        plan,
        planLabel: PLAN_LABELS[plan as AgentPlan],
        planPriceUsd: 0,
        accountType,
        planSelectionSkipped,
        capabilities: planDescriptor.capabilities,
        expiresIn: '90 days',
      },
    },
    { status: 201 },
  );
  await issueBrowserSession(response, {
    agentId,
    request: req,
  });
  return response;
}
