import { NextRequest, NextResponse } from 'next/server';
import { registerExternalAgent } from '@/src/external-agents/service';
import { ValidationError } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const result = await registerExternalAgent(body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const status = typeof (error as { statusCode?: unknown })?.statusCode === 'number'
      ? (error as { statusCode: number }).statusCode
      : undefined;

    if (status === 409 || error instanceof Error && error.message === 'Agent ID already registered') {
      return NextResponse.json({ error: 'Agent ID already registered' }, { status: 409 });
    }

    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
