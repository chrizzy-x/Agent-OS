import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

/**
 * GET /api/ffp/chains
 * Public endpoint — returns all known FFP sector chains with execution stats.
 * FFP chain coordinators use this to discover AgentOS bridge availability.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const supabase = getSupabaseAdmin();

    // Group by chain_id — get counts and last execution per chain
    const { data, error } = await supabase
      .from('ffp_chain_executions')
      .select('chain_id, status, executed_at')
      .order('executed_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to query chain executions: ${error.message}`);
    }

    // Aggregate stats per chain
    const chainMap = new Map<
      string,
      { total: number; success: number; failed: number; lastExecution: string | null }
    >();

    for (const row of data ?? []) {
      const chainId = row.chain_id as string;
      if (!chainMap.has(chainId)) {
        chainMap.set(chainId, {
          total: 0,
          success: 0,
          failed: 0,
          lastExecution: row.executed_at as string | null,
        });
      }
      const entry = chainMap.get(chainId)!;
      entry.total++;
      if ((row.status as string) === 'success') entry.success++;
      else entry.failed++;
      // Keep most recent (rows are ordered desc)
      if (!entry.lastExecution) {
        entry.lastExecution = row.executed_at as string | null;
      }
    }

    const chains = Array.from(chainMap.entries()).map(([chainId, stats]) => ({
      chainId,
      executions: stats.total,
      successful: stats.success,
      failed: stats.failed,
      lastExecution: stats.lastExecution,
    }));

    return NextResponse.json({ chains, total: chains.length });
  } catch (error) {
    console.error('[ffp/chains]', error instanceof Error ? error.message : error);
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
  }
}
