import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { verifyAgentToken, extractBearerToken } from '@/src/auth/agent-identity';

export const runtime = 'nodejs';

function auth(req: NextRequest) {
  const token = extractBearerToken(req.headers.get('Authorization') ?? undefined);
  if (!token) return null;
  try {
    return verifyAgentToken(token);
  } catch {
    return null;
  }
}

// GET /api/developer/payout-settings — return current payout settings
export async function GET(req: NextRequest) {
  const ctx = auth(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('agents')
    .select('metadata')
    .eq('id', ctx.agentId)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  const meta = (data.metadata as Record<string, unknown>) ?? {};
  return NextResponse.json({
    payout_email: (meta.payout_email as string) ?? '',
    payout_method: (meta.payout_method as string) ?? 'paypal',
    payout_requested: (meta.payout_requested as boolean) ?? false,
  });
}

// POST /api/developer/payout-settings — save payout settings
export async function POST(req: NextRequest) {
  const ctx = auth(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const payoutEmail = typeof body.payout_email === 'string' ? body.payout_email.trim() : '';
  const payoutMethod = typeof body.payout_method === 'string' ? body.payout_method : 'paypal';
  const requestPayout = body.request_payout === true;

  if (!payoutEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payoutEmail)) {
    return NextResponse.json({ error: 'Valid payout email required' }, { status: 400 });
  }

  const allowed = ['paypal', 'bank_transfer', 'crypto'];
  if (!allowed.includes(payoutMethod)) {
    return NextResponse.json({ error: 'Invalid payout method' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Fetch existing metadata to merge
  const { data: existing, error: fetchErr } = await supabase
    .from('agents')
    .select('metadata')
    .eq('id', ctx.agentId)
    .single();

  if (fetchErr || !existing) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  const meta = (existing.metadata as Record<string, unknown>) ?? {};
  const updatedMeta = {
    ...meta,
    payout_email: payoutEmail,
    payout_method: payoutMethod,
    ...(requestPayout ? { payout_requested: true, payout_requested_at: new Date().toISOString() } : {}),
  };

  const { error: updateErr } = await supabase
    .from('agents')
    .update({ metadata: updatedMeta })
    .eq('id', ctx.agentId);

  if (updateErr) {
    console.error('Payout settings update error:', updateErr);
    return NextResponse.json({ error: 'Failed to save payout settings' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    payout_email: payoutEmail,
    payout_method: payoutMethod,
    payout_requested: updatedMeta.payout_requested ?? false,
  });
}
