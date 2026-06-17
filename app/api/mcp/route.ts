import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { executeUniversalToolCall, listUniversalMcpTools } from '@/src/mcp/registry';
import { assertExternalAgentToolAccess, trackExternalAgentCall } from '@/src/external-agents/service';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { toErrorResponse } from '@/src/utils/errors';
import { sanitizeOutput } from '@/src/utils/output-sanitizer';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const tools = await listUniversalMcpTools().catch(() => []);
    let servers: Array<Record<string, unknown>> = [];
    try {
      const serverResponse = await getSupabaseAdmin()
        .from('mcp_servers')
        .select('name, description, category, icon, requires_consensus, consensus_threshold')
        .eq('active', true)
        .order('name', { ascending: true });
      servers = (serverResponse.data ?? []) as Array<Record<string, unknown>>;
    } catch {
      servers = [];
    }

    return NextResponse.json({
      server: 'agentos',
      tools,
      servers,
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}

export async function POST(req: NextRequest) {
  try {
    const agentContext = requireAgentContext(req.headers);
    const body = await req.json() as {
      method?: string;
      id?: number | string;
      params?: {
        server?: string;
        name?: string;
        arguments?: Record<string, unknown>;
      };
    };

    const method = body.method ?? '';
    const params = body.params ?? {};

    if (method === 'tools/list') {
      const tools = await listUniversalMcpTools();
      return NextResponse.json({
        jsonrpc: '2.0',
        id: body.id ?? 1,
        result: { tools },
        tools,
      });
    }

    if (method === 'tools/call') {
      const toolName = typeof params.name === 'string' ? params.name : '';
      if (!toolName) {
        return NextResponse.json({ error: 'params.name is required' }, { status: 400 });
      }

      await assertExternalAgentToolAccess(agentContext.agentId, toolName);

      const result = await executeUniversalToolCall({
        agentContext,
        name: toolName,
        server: params.server,
        arguments: params.arguments ?? {},
      });

      void trackExternalAgentCall(agentContext.agentId).catch(() => {});

      return NextResponse.json({
        jsonrpc: '2.0',
        id: body.id ?? 1,
        result: sanitizeOutput(result),
        success: true,
      });
    }

    return NextResponse.json({ error: `Method '${method}' not found` }, { status: 404 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
