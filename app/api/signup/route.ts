import { NextRequest, NextResponse } from 'next/server';
import { createAgentToken } from '@/src/auth/agent-identity';
import crypto from 'crypto';

export const runtime = 'nodejs';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateAgentId(): string {
  const random = crypto.randomBytes(18).toString('base64url');
  return `agent_${random}`;
}

async function tryStoreInSupabase(agentId: string, name: string, email: string): Promise<void> {
  try {
    const { getSupabaseAdmin } = await import('@/src/storage/supabase');
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('agents').insert({
      id: agentId,
      name,
      quotas: {},
      metadata: { email, signup_source: 'web' },
    });
    if (error) console.error('Signup Supabase insert error (non-fatal):', error.message);
  } catch (err) {
    console.error('Signup Supabase unavailable (non-fatal):', err);
  }
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

  const agentId = generateAgentId();
  const name = agentName || `Agent ${agentId.slice(0, 12)}`;

  // Generate JWT token — self-contained, works immediately as Bearer token
  let apiKey: string;
  try {
    apiKey = createAgentToken(agentId, { expiresIn: '90d' });
  } catch (err) {
    console.error('Token creation error:', err);
    return NextResponse.json(
      { error: 'Credential generation failed. JWT_SECRET may not be configured.' },
      { status: 500 }
    );
  }

  // Store in Supabase for records — fire and forget, non-blocking
  void tryStoreInSupabase(agentId, name, email);

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
