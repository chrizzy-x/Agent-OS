import { NextRequest, NextResponse } from 'next/server';
import { omitAgentIdentifierFields } from '@/src/auth/display-redaction';
import { getPublicDeveloperProfile } from '@/src/developers/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ handle: string }> }) {
  try {
    const { handle } = await params;
    const developer = await getPublicDeveloperProfile(handle);
    if (!developer) {
      return NextResponse.json({ code: 'NOT_FOUND', error: 'Developer not found', message: 'Developer not found' }, { status: 404 });
    }
    return NextResponse.json({ developer: omitAgentIdentifierFields(developer) });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
