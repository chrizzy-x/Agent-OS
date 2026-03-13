import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    name: 'AgentOS',
    version: '1.0.0',
    description: 'OS-level primitives for agents: memory, files, databases, networking, events and code execution',
    status: 'ok',
    endpoints: {
      'GET  /': 'Landing page',
      'GET  /api': 'API info (this response)',
      'GET  /health': 'Liveness check',
      'GET  /tools': 'List available MCP tools',
      'POST /mcp': 'Execute an MCP tool call (Bearer token required)',
      'POST /admin/agents': 'Create a new agent token (Admin token required)',
      'GET  /ffp/status': 'FFP mode and config summary',
    },
  });
}
