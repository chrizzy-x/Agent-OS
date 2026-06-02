import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { withStudioDefaultAllowedDomains } from '@/src/studio/domains';
import { executeStudioCommand } from '@/src/studio/service';
import type { StudioCommandRequest, StudioCommandResponse } from '@/src/studio/types';
import { toErrorResponse } from '@/src/utils/errors';
import { sanitizeErrorMessage, sanitizeOutput } from '@/src/utils/output-sanitizer';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  let command = '';

  try {
    const agentContext = withStudioDefaultAllowedDomains(await requireRouteCapability(request.headers, 'studio.command'));
    const body = await request.json() as StudioCommandRequest;
    command = typeof body.command === 'string' ? body.command : '';
    const studioContext = { ...agentContext, studioSessionId: typeof body.sessionId === 'string' ? body.sessionId : null };

    const response = await executeStudioCommand({
      agentContext: studioContext,
      command,
      confirmToken: typeof body.confirmToken === 'string' ? body.confirmToken : undefined,
      advancedMode: body.advancedMode === true,
    });

    return NextResponse.json({
      ...response,
      summary: sanitizeErrorMessage(response.summary),
      result: response.result === undefined ? undefined : sanitizeOutput(response.result),
      warnings: response.warnings?.map(warning => sanitizeErrorMessage(warning)),
      preview: response.preview ? {
        ...response.preview,
        payloadSummary: response.preview.payloadSummary ? sanitizeErrorMessage(response.preview.payloadSummary) : response.preview.payloadSummary,
        risks: response.preview.risks?.map(risk => sanitizeErrorMessage(risk)),
      } : undefined,
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    const response: StudioCommandResponse = {
      kind: 'error',
      command,
      mutating: false,
      summary: err.message,
      warnings: [err.code],
    };

    return NextResponse.json(response, { status: err.statusCode });
  }
}
