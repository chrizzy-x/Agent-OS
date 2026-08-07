import { NextRequest, NextResponse } from 'next/server';
import { createAgentToken } from '@/src/auth/agent-identity';
import { issueBrowserSession } from '@/src/auth/browser-auth';
import { verifyPassword } from '@/src/auth/password';
import { authStoreUnavailableResponse, findAccountById, findAccountsByEmail, isAuthStoreUnavailableError, type AgentAccount } from '@/src/auth/agent-store';
import { hasCapability } from '@/src/auth/capabilities';
import { createSigninLookupHint, resolveSigninLookupHint } from '@/src/auth/signin-hint';

export const runtime = 'nodejs';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
  const signinHint = typeof body.signinHint === 'string' ? body.signinHint : '';

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: 'invalid_email', message: 'Valid email required' }, { status: 400 });
  }

  if (!password) {
    return NextResponse.json({ error: 'invalid_password', message: 'Password required' }, { status: 400 });
  }

  let accounts: AgentAccount[] | null = null;
  const hintedAgentId = signinHint ? resolveSigninLookupHint(signinHint, email) : null;
  if (hintedAgentId) {
    const hintedAccount = await findAccountById(hintedAgentId).catch(() => null);
    if (hintedAccount?.email.trim().toLowerCase() === email) {
      accounts = [hintedAccount];
    }
  }

  try {
    accounts ??= await findAccountsByEmail(email);
  } catch (error) {
    if (isAuthStoreUnavailableError(error)) {
      return NextResponse.json(authStoreUnavailableResponse(), { status: 503 });
    }
    throw error;
  }
  if (accounts.length === 0) {
    return NextResponse.json(
      { error: 'not_found', message: 'No account found for that email. Please sign up first.' },
      { status: 404 },
    );
  }

  if (accounts.length > 1) {
    return NextResponse.json(
      { error: 'conflict', message: 'Multiple accounts share this email. Contact support to restore access safely.' },
      { status: 409 },
    );
  }

  const account = accounts[0];
  if (!account.passwordHash) {
    return NextResponse.json(
      { error: 'password_reset_required', message: 'This account requires a password reset. Request a reset link to continue.' },
      { status: 401 },
    );
  }

  const valid = await verifyPassword(password, account.passwordHash);
  if (!valid) {
    return NextResponse.json(
      { error: 'invalid_credentials', message: 'Incorrect password. Please try again.' },
      { status: 401 },
    );
  }

  let bearerToken: string;
  try {
    bearerToken = createAgentToken(account.id, { expiresIn: '90d' });
  } catch {
    return NextResponse.json(
      { error: 'credentials_unavailable', message: 'Failed to generate credentials. Please try again.' },
      { status: 400 },
    );
  }

  const canIssueBearerToken = hasCapability(account.metadata.plan, 'use_bearer_token');
  const response = NextResponse.json({
    success: true,
    credentials: {
      bearerToken: canIssueBearerToken ? bearerToken : null,
      apiKey: canIssueBearerToken ? bearerToken : null,
      agentName: account.name,
      signinHint: createSigninLookupHint(account.id, email),
      expiresIn: '90 days',
    },
  });
  await issueBrowserSession(response, {
    agentId: account.id,
    request: req,
  });
  return response;
}
