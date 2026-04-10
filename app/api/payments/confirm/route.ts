import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

const USDC_MINT_SOLANA = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_MINT_BASE   = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const TRANSFER_TOPIC   = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

async function verifySolana(txHash: string, wallet: string, amountUsdc: string): Promise<boolean> {
  const rpc = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const res = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'getTransaction',
      params: [txHash, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }],
    }),
  });
  const json = await res.json() as { result?: unknown };
  const result = json.result as { meta?: { postTokenBalances?: Array<{ owner: string; mint: string; uiTokenAmount: { uiAmountString: string } }>; preTokenBalances?: Array<{ owner: string; mint: string; uiTokenAmount: { uiAmountString: string } }> } } | null;
  if (!result?.meta) return false;

  const post = (result.meta.postTokenBalances ?? []).find(b => b.owner === wallet && b.mint === USDC_MINT_SOLANA);
  const pre  = (result.meta.preTokenBalances  ?? []).find(b => b.owner === wallet && b.mint === USDC_MINT_SOLANA);
  if (!post) return false;

  const received = parseFloat(post.uiTokenAmount.uiAmountString) - (pre ? parseFloat(pre.uiTokenAmount.uiAmountString) : 0);
  return received >= parseFloat(amountUsdc) * 0.99;
}

async function verifyBase(txHash: string, wallet: string, amountUsdc: string): Promise<boolean> {
  const rpc = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
  const res = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txHash] }),
  });
  const json = await res.json() as { result?: unknown };
  const receipt = json.result as { status: string; logs: Array<{ address: string; topics: string[]; data: string }> } | null;
  if (!receipt || receipt.status !== '0x1') return false;

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== USDC_MINT_BASE.toLowerCase()) continue;
    if (log.topics[0] !== TRANSFER_TOPIC) continue;
    const toAddr = `0x${log.topics[2]?.slice(26)}`.toLowerCase();
    if (toAddr !== wallet.toLowerCase()) continue;
    const received = parseInt(log.data, 16) / 1e6; // USDC = 6 decimals on Base
    if (received >= parseFloat(amountUsdc) * 0.99) return true;
  }
  return false;
}

// POST /api/payments/confirm
// Body: { txHash, wallet, amountUsdc, network: 'solana'|'base', reference, skillId }
export async function POST(req: NextRequest) {
  try {
    const ctx = requireAgentContext(req.headers);

    let body: { txHash?: string; wallet?: string; amountUsdc?: string; network?: string; reference?: string; skillId?: string };
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { txHash, wallet, amountUsdc, network = 'solana', reference, skillId } = body;
    if (!txHash || !wallet || !amountUsdc || !reference || !skillId)
      return NextResponse.json({ error: 'txHash, wallet, amountUsdc, reference and skillId are required' }, { status: 400 });

    const supabase = getSupabaseAdmin();

    // Replay-attack guard: reject if this tx was already confirmed
    const { data: existingByTx } = await supabase
      .from('skill_purchases')
      .select('status')
      .eq('payment_ref', txHash)
      .maybeSingle();
    if (existingByTx?.status === 'confirmed')
      return NextResponse.json({ error: 'Transaction already used' }, { status: 400 });

    // Verify on-chain
    let verified = false;
    if (network === 'solana') verified = await verifySolana(txHash, wallet, amountUsdc);
    else if (network === 'base') verified = await verifyBase(txHash, wallet, amountUsdc);
    else return NextResponse.json({ error: 'Unsupported network' }, { status: 400 });

    if (!verified)
      return NextResponse.json({ error: 'Transaction not verified — check the hash and try again' }, { status: 402 });

    // Mark purchase confirmed (update reference → actual tx hash)
    await supabase
      .from('skill_purchases')
      .update({ payment_ref: txHash, status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('payment_ref', reference);

    // Install skill
    const { error: installErr } = await supabase
      .from('agent_skills')
      .upsert({ agent_id: ctx.agentId, skill_id: skillId, installed_at: new Date().toISOString() }, { onConflict: 'agent_id,skill_id' });

    if (installErr) {
      console.error('[confirm] install error:', installErr);
      return NextResponse.json({ error: 'Payment verified but activation failed — contact support' }, { status: 500 });
    }

    try { await supabase.rpc('increment_skill_installs', { skill_id_arg: skillId }).throwOnError(); } catch { /* non-fatal */ }

    return NextResponse.json({ success: true, skillId });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
