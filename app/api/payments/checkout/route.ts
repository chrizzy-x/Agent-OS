import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

const USDC_MINT_SOLANA = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_MINT_BASE   = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// POST /api/payments/checkout
// Body: { skillId: string, network?: 'solana' | 'base' }
export async function POST(req: NextRequest) {
  try {
    const ctx = requireAgentContext(req.headers);

    let body: { skillId?: string; network?: string };
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { skillId, network = 'solana' } = body;
    if (!skillId || typeof skillId !== 'string')
      return NextResponse.json({ error: 'skillId is required' }, { status: 400 });
    if (network !== 'solana' && network !== 'base')
      return NextResponse.json({ error: 'network must be solana or base' }, { status: 400 });

    const supabase = getSupabaseAdmin();

    const { data: skill, error: skillErr } = await supabase
      .from('skills')
      .select('id, name, slug, pricing_model, price_per_call, author_id')
      .eq('id', skillId)
      .eq('published', true)
      .single();

    if (skillErr || !skill)
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });

    if (skill.pricing_model === 'free' || Number(skill.price_per_call) === 0)
      return NextResponse.json({ error: 'This skill is free — use /api/skills/install' }, { status: 400 });

    // Get developer's payout wallet
    const { data: authorAgent } = await supabase
      .from('agents')
      .select('metadata')
      .eq('id', skill.author_id)
      .maybeSingle();

    const wallet = authorAgent?.metadata?.payout_wallet as string | undefined;
    if (!wallet)
      return NextResponse.json({ error: 'Developer has not set up a crypto wallet' }, { status: 400 });

    const amountUsdc = Number(skill.price_per_call).toFixed(2);
    const reference  = `${ctx.agentId.slice(0, 8)}-${skill.id.slice(0, 8)}-${Date.now()}`;
    const usdcMint   = network === 'solana' ? USDC_MINT_SOLANA : USDC_MINT_BASE;

    await supabase.from('skill_purchases').upsert({
      agent_id:         ctx.agentId,
      skill_id:         skill.id,
      stripe_session_id: reference,
      payment_method:   `crypto_${network}`,
      payment_ref:      reference,
      status:           'pending',
    }, { onConflict: 'stripe_session_id' });

    return NextResponse.json({ wallet, amountUsdc, usdcMint, network, reference, skillId: skill.id, skillSlug: skill.slug });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
