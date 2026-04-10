import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { requireAgentContext } from '@/src/auth/request';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

// GET /api/developer/payout-settings — return current payout settings
export async function GET(req: NextRequest) {
  try {
    const ctx = requireAgentContext(req.headers);

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
      payout_wallet: (meta.payout_wallet as string) ?? '',
      payout_method: (meta.payout_method as string) ?? 'paypal',
      payout_requested: (meta.payout_requested as boolean) ?? false,
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}

// POST /api/developer/payout-settings — save payout settings
export async function POST(req: NextRequest) {
  try {
    const ctx = requireAgentContext(req.headers);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const payoutMethod = typeof body.payout_method === 'string' ? body.payout_method : 'paypal';
    const requestPayout = body.request_payout === true;

    const allowed = ['paypal', 'bank_transfer', 'crypto'];
    if (!allowed.includes(payoutMethod)) {
      return NextResponse.json({ error: 'Invalid payout method' }, { status: 400 });
    }

    // Validate based on payment method
    let payoutEmail = '';
    let payoutWallet = '';

    if (payoutMethod === 'crypto') {
      payoutWallet = typeof body.payout_wallet === 'string' ? body.payout_wallet.trim() : '';
      if (!payoutWallet || payoutWallet.length < 32) {
        return NextResponse.json({ error: 'Valid wallet address required for crypto payouts' }, { status: 400 });
      }
    } else {
      payoutEmail = typeof body.payout_email === 'string' ? body.payout_email.trim() : '';
      if (!payoutEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payoutEmail)) {
        return NextResponse.json({ error: 'Valid payout email required' }, { status: 400 });
      }
    }

    const supabase = getSupabaseAdmin();

    const { data: existing, error: fetchErr } = await supabase
      .from('agents')
      .select('metadata')
      .eq('id', ctx.agentId)
      .single();

    if (fetchErr || !existing) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

    const meta = (existing.metadata as Record<string, unknown>) ?? {};
    const updatedMeta = {
      ...meta,
      payout_method: payoutMethod,
      payout_email: payoutMethod !== 'crypto' ? payoutEmail : (meta.payout_email ?? ''),
      payout_wallet: payoutMethod === 'crypto' ? payoutWallet : (meta.payout_wallet ?? ''),
      ...(requestPayout ? { payout_requested: true, payout_requested_at: new Date().toISOString() } : {}),
    };

    const { error: updateErr } = await supabase
      .from('agents')
      .update({ metadata: updatedMeta })
      .eq('id', ctx.agentId);

    if (updateErr) {
      console.error('[payout-settings] update error:', updateErr);
      return NextResponse.json({ error: 'Failed to save payout settings' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      payout_email: updatedMeta.payout_email,
      payout_wallet: updatedMeta.payout_wallet,
      payout_method: payoutMethod,
      payout_requested: updatedMeta.payout_requested ?? false,
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
