import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/mcp' && request.method === 'POST') {
    return NextResponse.rewrite(new URL('/api/mcp/execute', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/mcp'],
};
