import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { executeUniversalToolCall, listUniversalMcpTools } from '@/src/mcp/registry';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const [tools, serverResponse] = await Promise.all([
      listUniversalMcpTools(),
      getSupabaseAdmin()
        .from('mcp_servers')
        .select('name, description, category, icon, requires_consensus, consensus_threshold')
        .eq('active', true)
        .order('name', { ascending: true }),
    ]);

    return NextResponse.json({
      server: 'agentos',
      tools,
      servers: serverResponse.data ?? [],
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

      const result = await executeUniversalToolCall({
        agentContext,
        name: toolName,
        server: params.server,
        arguments: params.arguments ?? {},
      });

      return NextResponse.json({
        jsonrpc: '2.0',
        id: body.id ?? 1,
        result,
      });
    }

    return NextResponse.json({ error: `Method '${method}' not found` }, { status: 404 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
