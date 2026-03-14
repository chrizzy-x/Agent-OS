import { NextRequest, NextResponse } from 'next/server';
import { createAgentToken } from '@/src/auth/agent-identity';
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

  const { data: agent } = await supabase
    .from('agents')
    .select('id, name, metadata')
    .eq('metadata->>email', email)
    .maybeSingle();

  if (!agent) {
    return NextResponse.json(
      { error: 'No account found for that email. Please sign up first.' },
      { status: 404 }
    );
  }

  // Verify password
  const passwordHash = (agent.metadata as Record<string, string>)?.password_hash;
  if (!passwordHash) {
    // Legacy account without password — reject and prompt them to reset
    return NextResponse.json(
      { error: 'This account requires a password reset. Please sign up again with a new password.' },
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

  let apiKey: string;
  try {
    apiKey = createAgentToken(agent.id, { expiresIn: '90d' });
  } catch (err) {
    console.error('Token creation error:', err);
    return NextResponse.json({ error: 'Failed to generate credentials. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    credentials: {
      agentId: agent.id,
      apiKey,
      agentName: agent.name,
    },
  });
}
