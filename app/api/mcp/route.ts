import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { MCPRouter } from '@/lib/mcp-router';

const router = new MCPRouter();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function GET(_req: NextRequest) {
  const { data: servers } = await supabase
    .from('mcp_servers')
    .select('name, description, category, icon, requires_consensus')
    .eq('active', true);

  return NextResponse.json({ servers: servers ?? [] });
}

export async function POST(req: NextRequest) {
  try {
    const agentId = req.headers.get('X-Agent-ID');
    const apiKey = req.headers.get('Authorization')?.replace('Bearer ', '');

    if (!agentId || !apiKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as {
      method: string;
      id?: number;
      params?: {
        server?: string;
        name?: string;
        arguments?: Record<string, unknown>;
      };
    };

    const { method, params } = body;

    if (method === 'tools/list') {
      const { data: servers } = await supabase
        .from('mcp_servers')
        .select('*')
        .eq('active', true);

      const tools = (servers ?? []).flatMap(server =>
        ((server.tools as unknown[]) ?? []).map((tool: unknown) => ({
          ...(tool as Record<string, unknown>),
          server: server.name,
          requires_consensus: server.requires_consensus,
        }))
      );

      return NextResponse.json({ tools });
    }

    if (method === 'tools/call') {
      const server = params?.server ?? 'default';
      const tool = params?.name;
      const args = params?.arguments ?? {};

      if (!tool) {
        return NextResponse.json({ error: 'params.name is required' }, { status: 400 });
      }

      const result = await router.routeMCPCall({
        agentId,
        server,
        tool,
        arguments: args,
      });

      return NextResponse.json({
        jsonrpc: '2.0',
        id: body.id ?? 1,
        result,
      });
    }

    return NextResponse.json({ error: `Method '${method}' not found` }, { status: 404 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
