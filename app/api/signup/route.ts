import { NextRequest, NextResponse } from 'next/server';
import { createAgentToken } from '@/src/auth/agent-identity';
import { getSupabaseAdmin } from '@/src/storage/supabase';
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
  const agentName = typeof body.agentName === 'string' ? body.agentName.trim() : '';

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
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
      { error: 'Email already registered. Check your inbox for your original credentials.' },
      { status: 409 }
    );
  }

  const agentId = generateAgentId();
  const name = agentName || `Agent ${agentId.slice(0, 12)}`;

  // Insert agent record into Supabase
  const { error: insertError } = await supabase.from('agents').insert({
    id: agentId,
    name,
    quotas: {},
    metadata: { email, signup_source: 'web' },
  });

  if (insertError) {
    console.error('Signup insert error:', insertError);
    return NextResponse.json({ error: 'Failed to create agent. Please try again.' }, { status: 500 });
  }

  // Create JWT token (this is the API key users will use as Bearer token)
  let apiKey: string;
  try {
    apiKey = createAgentToken(agentId, { expiresIn: '90d' });
  } catch (err) {
    console.error('Token creation error:', err);
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
