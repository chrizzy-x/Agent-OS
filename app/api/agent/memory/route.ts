import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { semanticMemRecall } from '@/src/primitives/semantic-mem';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

/**
 * GET /api/agent/memory?query=&tags=tag1,tag2&limit=10
 * Returns persistent semantic memories for the authenticated agent.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const ctx = requireAgentContext(req.headers);

    const { searchParams } = req.nextUrl;
    const query = searchParams.get('query') ?? undefined;
    const tagsParam = searchParams.get('tags');
    const tags = tagsParam ? tagsParam.split(',').map(t => t.trim()).filter(Boolean) : undefined;
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 10, 100) : 10;

    const result = await semanticMemRecall(ctx, { query, tags, limit });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[agent/memory]', error instanceof Error ? error.message : error);
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
  }
}
