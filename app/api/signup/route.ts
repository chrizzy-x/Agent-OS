import { NextRequest, NextResponse } from 'next/server';
import { createAgentToken } from '@/src/auth/agent-identity';
import { setAgentSessionCookie } from '@/src/auth/session-cookie';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { hashPassword } from '@/src/auth/password';
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
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const agentName = typeof body.agentName === 'string' ? body.agentName.trim() : '';

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  if (!password || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: existingAgents, error: existingError, count } = await supabase
    .from('agents')
    .select('id', { count: 'exact' })
    .eq('metadata->>email', email)
    .limit(2);

  if (existingError) {
    console.error('[signup] lookup error:', existingError);
    return NextResponse.json({ error: 'Failed to verify account uniqueness. Please try again.' }, { status: 500 });
  }

  if ((count ?? existingAgents?.length ?? 0) > 0) {
    return NextResponse.json(
      { error: 'An account with this email already exists. Please sign in.' },
      { status: 409 }
    );
  }

  const agentId = generateAgentId();
  const name = agentName || `Agent ${agentId.slice(0, 12)}`;
  const passwordHash = await hashPassword(password);

  const { error: insertError } = await supabase.from('agents').insert({
    id: agentId,
    name,
    quotas: {},
    metadata: { email, password_hash: passwordHash, signup_source: 'web' },
  });

  if (insertError) {
    console.error('[signup] insert error:', insertError);
    if (insertError.code === '23505') {
      return NextResponse.json(
        { error: 'An account with this email already exists. Please sign in.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: 'Failed to create account. Please try again.' }, { status: 500 });
  }

  let bearerToken: string;
  try {
    bearerToken = createAgentToken(agentId, { expiresIn: '90d' });
  } catch (err) {
    console.error('[signup] token creation error:', err);
    await supabase.from('agents').delete().eq('id', agentId);
    return NextResponse.json({ error: 'Failed to generate credentials. Please try again.' }, { status: 500 });
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
    { status: 201 }
  );
  setAgentSessionCookie(response, bearerToken);
  return response;
}
