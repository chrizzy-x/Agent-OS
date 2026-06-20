import { NextRequest, NextResponse } from 'next/server';

const REDIRECTS: Array<{ prefix: string; target: string }> = [
  { prefix: '/apps', target: '/library?section=apps' },
  { prefix: '/skills', target: '/library?section=skills' },
  { prefix: '/subagents', target: '/library?section=subagents' },
  { prefix: '/agents', target: '/library?section=subagents' },
  { prefix: '/memory', target: '/library?section=memory' },
  { prefix: '/vault', target: '/library?section=vault' },
  { prefix: '/connectors', target: '/library?section=connectors' },
  { prefix: '/marketplace', target: '/appstore' },
  { prefix: '/profile', target: '/settings?tab=profile' },
  { prefix: '/billing', target: '/settings?tab=billing' },
  { prefix: '/team', target: '/settings?tab=workspace' },
  { prefix: '/sdk', target: '/developer?tab=sdk' },
  { prefix: '/publishing', target: '/developer?tab=publishing' },
  { prefix: '/analytics', target: '/developer?tab=analytics' },
  { prefix: '/audit', target: '/developer?tab=logs' },
  { prefix: '/ops', target: '/developer?tab=recovery' },
  { prefix: '/dashboard', target: '/' },
  { prefix: '/workspace', target: '/' },
  { prefix: '/workspaces', target: '/' },
];

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/mcp' && request.method === 'POST') {
    return NextResponse.rewrite(new URL('/api/mcp/execute', request.url));
  }
  if (request.nextUrl.pathname === '/mcp' && request.method === 'GET') {
    return NextResponse.redirect(new URL('/library?section=connectors', request.url));
  }
  const match = REDIRECTS.find(item => request.nextUrl.pathname === item.prefix || request.nextUrl.pathname.startsWith(`${item.prefix}/`));
  if (match && request.method === 'GET') {
    return NextResponse.redirect(new URL(match.target, request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/mcp',
    '/apps/:path*',
    '/skills/:path*',
    '/subagents/:path*',
    '/agents/:path*',
    '/memory/:path*',
    '/vault/:path*',
    '/connectors/:path*',
    '/marketplace/:path*',
    '/profile/:path*',
    '/billing/:path*',
    '/team/:path*',
    '/sdk/:path*',
    '/publishing/:path*',
    '/analytics/:path*',
    '/audit/:path*',
    '/ops/:path*',
    '/dashboard/:path*',
    '/workspace/:path*',
    '/workspaces/:path*',
  ],
};
