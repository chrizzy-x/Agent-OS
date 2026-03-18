import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    name: 'AgentOS',
    version: '1.0.0',
    description: 'Universal MCP, core primitives, marketplace skills, and consensus-aware agent infrastructure.',
    status: 'ok',
    endpoints: {
      'GET  /': 'Landing page',
      'GET  /api': 'API info (this response)',
      'GET  /health': 'Liveness check',
      'GET  /tools': 'List universal MCP tools',
      'POST /mcp': 'Universal MCP tool execution (Bearer token required)',
      'GET  /api/mcp': 'Universal MCP registry and active external servers',
      'POST /api/mcp': 'JSON-RPC MCP entrypoint (Bearer token required)',
      'GET  /studio': 'Terminal-style Studio for guided agent setup and operations',
      'POST /api/studio/command': 'Studio command execution and mutation previews (Bearer token required)',
      'GET  /ops': 'Autonomous crew console',
      'GET  /docs/features': 'Complete plain-English feature catalog',
    },
  });
}


