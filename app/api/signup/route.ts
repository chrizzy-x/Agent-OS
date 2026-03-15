import { NextRequest, NextResponse } from 'next/server';
import { createAgentToken } from '@/src/auth/agent-identity';
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

  // Check for existing registration
  const { data: existing } = await supabase
    .from('agents')
    .select('id')
    .eq('metadata->>email', email)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: 'An account with this email already exists. Please sign in.' },
      { status: 409 }
    );
  }

  const agentId = generateAgentId();
  const name = agentName || `Agent ${agentId.slice(0, 12)}`;
  const passwordHash = await hashPassword(password);

  // Insert agent record into Supabase
  const { error: insertError } = await supabase.from('agents').insert({
    id: agentId,
    name,
    quotas: {},
    metadata: { email, password_hash: passwordHash, signup_source: 'web' },
  });

  if (insertError) {
    console.error('[signup] insert error:', insertError);
    return NextResponse.json({ error: 'Failed to create account. Please try again.' }, { status: 500 });
  }

  // Create JWT token (this is the API key users will use as Bearer token)
  let apiKey: string;
  try {
    apiKey = createAgentToken(agentId, { expiresIn: '90d' });
  } catch (err) {
    console.error('[signup] token creation error:', err);
    // Clean up the inserted agent on failure
    await supabase.from('agents').delete().eq('id', agentId);
    return NextResponse.json({ error: 'Failed to generate credentials. Please try again.' }, { status: 500 });
  }

  return NextResponse.json(
    {
      success: true,
      credentials: {
        agentId,
        apiKey,
        expiresIn: '90 days',
      },
    },
    { status: 201 }
  );
}
