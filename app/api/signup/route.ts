import { NextRequest, NextResponse } from 'next/server';
import { createAgentToken } from '@/src/auth/agent-identity';
import { setAgentSessionCookie } from '@/src/auth/session-cookie';
import { hashPassword } from '@/src/auth/password';
import { createAgentAccount, findAccountsByEmail } from '@/src/auth/agent-store';
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

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: 'invalid_email', message: 'Valid email required' }, { status: 400 });
  }

  if (!password || password.length < 8) {
    return NextResponse.json({ error: 'invalid_password', message: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const existingAccounts = await findAccountsByEmail(email);
  if (existingAccounts.length > 0) {
    return NextResponse.json(
      { error: 'conflict', message: 'An account with this email already exists. Please sign in.' },
      { status: 409 },
    );
  }

  const agentId = generateAgentId();
  const name = agentName || `Agent ${agentId.slice(0, 12)}`;
  const passwordHash = await hashPassword(password);
  const created = await createAgentAccount({ id: agentId, name, email, passwordHash });

  if (created.duplicate) {
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

  const response = NextResponse.json(
    {
      success: true,
      credentials: {
        agentId,
        bearerToken,
        apiKey: bearerToken,
        expiresIn: '90 days',
      },
    },
    { status: 201 },
  );
  setAgentSessionCookie(response, bearerToken);
  return response;
}