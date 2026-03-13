import { NextResponse } from 'next/server';
import { TOOLS } from '@/src/tools';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    tools: Object.keys(TOOLS).length,
  });
}
