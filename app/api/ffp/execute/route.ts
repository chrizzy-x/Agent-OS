import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { verifyConsensusProof, hashInput } from '@/src/ffp/chain-verifier';
import type { ConsensusProof } from '@/src/ffp/chain-verifier';
import { buildChainScopedContext, getScopedAgentId } from '@/src/ffp/chain-context';
import { executeUniversalToolCall } from '@/src/mcp/registry';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { toErrorResponse, ValidationError } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // 1. Auth — the caller must be a registered agent with a valid bearer token
    requireAgentContext(req.headers);

    // 2. Parse body
    const body = (await req.json()) as {
      tool?: unknown;
      input?: unknown;
      proof?: unknown;
    };

    const { tool, input, proof } = body;

    if (typeof tool !== 'string' || !tool) {
      throw new ValidationError('tool is required');
    }
    if (!proof || typeof proof !== 'object') {
      throw new ValidationError('proof is required');
    }

    // 3. Verify consensus proof
    const typedProof = proof as ConsensusProof;
    const verificationResult = verifyConsensusProof(typedProof, input ?? {});
    if (!verificationResult.valid) {
      return NextResponse.json(
        { error: verificationResult.reason },
        { status: 403 },
      );
    }

    // 4. Build chain-scoped context (auto-namespaces all 6 primitives)
    const scopedCtx = buildChainScopedContext(typedProof.chainId, typedProof.agentId);
    const scopedAgentId = getScopedAgentId(typedProof.chainId, typedProof.agentId);

    // 5. Execute the tool call
    const inputObj =
      input !== null && input !== undefined && typeof input === 'object'
        ? (input as Record<string, unknown>)
        : {};

    let result: unknown;
    let status: 'success' | 'failed' = 'success';
    let errorMessage: string | null = null;

    try {
      result = await executeUniversalToolCall({
        agentContext: scopedCtx,
        name: tool,
        arguments: inputObj,
      });
    } catch (execError) {
      status = 'failed';
      errorMessage = execError instanceof Error ? execError.message : String(execError);
      result = null;
    }

    // 6. Log execution to ffp_chain_executions
    const supabase = getSupabaseAdmin();
    const { data: logRow } = await supabase
      .from('ffp_chain_executions')
      .insert({
        chain_id: typedProof.chainId,
        agent_id: typedProof.agentId,
        scoped_agent_id: scopedAgentId,
        proposal_id: typedProof.proposalId,
        tool,
        input: inputObj,
        result: result ?? null,
        status,
        error_message: errorMessage,
        consensus_threshold: typedProof.threshold,
        validator_count: typedProof.signatures.length,
        input_hash: hashInput(input ?? {}),
      })
      .select('id')
      .single();

    const executionId: string | null = logRow?.id ?? null;

    // 7. Return result (or error if execution failed)
    if (status === 'failed') {
      return NextResponse.json(
        {
          executed: false,
          error: errorMessage,
          executionId,
          chainId: typedProof.chainId,
          agentId: typedProof.agentId,
          scopedAgentId,
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      executed: true,
      result,
      executionId,
      chainId: typedProof.chainId,
      agentId: typedProof.agentId,
      scopedAgentId,
    });
  } catch (error) {
    console.error('[ffp/execute]', error instanceof Error ? error.message : error);
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
  }
}
