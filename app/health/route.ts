import { NextResponse } from 'next/server';
import { APP_VERSION } from '@/src/config/release';
import { TOOLS } from '@/src/tools';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
    tools: Object.keys(TOOLS).length,
  });
}
