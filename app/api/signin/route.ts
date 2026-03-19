import { NextRequest, NextResponse } from 'next/server';
import { createAgentToken } from '@/src/auth/agent-identity';
import { setAgentSessionCookie } from '@/src/auth/session-cookie';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { verifyPassword } from '@/src/auth/password';

export const runtime = 'nodejs';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  if (!password) {
    return NextResponse.json({ error: 'Password required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: agents, error: lookupError, count } = await supabase
    .from('agents')
    .select('id, name, metadata', { count: 'exact' })
    .eq('metadata->>email', email)
    .limit(2);

  if (lookupError) {
    console.error('Signin lookup error:', lookupError);
    return NextResponse.json({ error: 'Failed to look up this account. Please try again.' }, { status: 500 });
  }

  if ((count ?? agents?.length ?? 0) === 0 || !agents?.[0]) {
    return NextResponse.json(
      { error: 'No account found for that email. Please sign up first.' },
      { status: 404 }
    );
  }

  if ((count ?? agents.length) > 1) {
    return NextResponse.json(
      { error: 'Multiple accounts share this email. Contact support to restore access safely.' },
      { status: 409 }
    );
  }

  const agent = agents[0];
  const passwordHash = (agent.metadata as Record<string, string> | null | undefined)?.password_hash;
  if (!passwordHash) {
    return NextResponse.json(
      { error: 'This account requires a password reset. Request a reset link to continue.' },
      { status: 401 }
    );
  }

  const valid = await verifyPassword(password, passwordHash);
  if (!valid) {
    return NextResponse.json(
      { error: 'Incorrect password. Please try again.' },
      { status: 401 }
    );
  }

  let bearerToken: string;
  try {
    bearerToken = createAgentToken(agent.id, { expiresIn: '90d' });
  } catch (err) {
    console.error('[signin] token creation error:', err);
    return NextResponse.json({ error: 'Failed to generate credentials. Please try again.' }, { status: 500 });
  }

  const response = NextResponse.json({
    success: true,
    credentials: {
      agentId: agent.id,
      bearerToken,
      apiKey: bearerToken,
      agentName: agent.name,
      expiresIn: '90 days',
    },
  });
  setAgentSessionCookie(response, bearerToken);
  return response;
}
