import { NextRequest, NextResponse } from 'next/server';
import { verifyAgentToken, extractBearerToken } from '@/src/auth/agent-identity';
import { toErrorResponse } from '@/src/utils/errors';
import { TOOLS } from '@/src/tools';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // Authenticate
  const token = extractBearerToken(req.headers.get('authorization') ?? undefined);
  if (!token) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authorization: Bearer <token> header required' } },
      { status: 401 }
    );
  }

  let ctx;
  try {
    ctx = verifyAgentToken(token);
  } catch (err) {
    const errResp = toErrorResponse(err);
    return NextResponse.json({ error: errResp }, { status: errResp.statusCode });
  }

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Request body is not valid JSON' } },
      { status: 400 }
    );
  }

  const tool = typeof body.tool === 'string' ? body.tool : undefined;
  const input = body.input ?? body.arguments ?? {};

  if (!tool) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Request must include "tool" field' } },
      { status: 400 }
    );
  }

  const handler = TOOLS[tool];
  if (!handler) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `Unknown tool: ${tool}. Available tools: ${Object.keys(TOOLS).join(', ')}` } },
      { status: 404 }
    );
  }

  try {
    const result = await handler(ctx, input);
    return NextResponse.json({ result });
  } catch (err) {
    const errResp = toErrorResponse(err);
    return NextResponse.json({ error: errResp }, { status: errResp.statusCode });
  }
}
