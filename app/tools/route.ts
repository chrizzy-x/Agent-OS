import { NextResponse } from 'next/server';
import { TOOLS } from '@/src/tools';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ tools: Object.keys(TOOLS) });
}
