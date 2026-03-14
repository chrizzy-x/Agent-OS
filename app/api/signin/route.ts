import { NextRequest, NextResponse } from 'next/server';
import { createAgentToken } from '@/src/auth/agent-identity';
import { getSupabaseAdmin } from '@/src/storage/supabase';

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

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: agent } = await supabase
    .from('agents')
    .select('id, name')
    .eq('metadata->>email', email)
    .maybeSingle();

  if (!agent) {
    // Don't reveal whether email exists — generic message
    return NextResponse.json(
      { error: 'No account found for that email. Please sign up first.' },
      { status: 404 }
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
