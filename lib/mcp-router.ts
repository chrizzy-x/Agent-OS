import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export class MCPRouter {
  private ffpMode: boolean;

  constructor() {
    this.ffpMode = process.env.FFP_MODE === 'enabled';
  }

  async routeMCPCall(params: {
    agentId: string;
    server: string;
    tool: string;
    arguments: Record<string, unknown>;
  }) {
    const { agentId, server, tool, arguments: args } = params;

    const { data: mcpServer } = await supabase
      .from('mcp_servers')
      .select('*')
      .eq('name', server)
      .single();

    if (!mcpServer) {
      throw new Error(`MCP server '${server}' not found`);
    }

    let proposalId: string | null = null;
    let consensusApproved = false;
    let consensusVotes: unknown = null;

    if (this.ffpMode && mcpServer.requires_consensus) {
      const proposal = await this.proposeToConsensus({ agentId, action: 'mcp_call', server, tool, arguments: args });
      proposalId = proposal.id;
      const consensus = await this.waitForConsensus(proposal.id);
      consensusApproved = consensus.approved;
      consensusVotes = consensus.votes;

      if (!consensusApproved) {
        await supabase.from('mcp_calls').insert({
          agent_id: agentId,
          mcp_server: server,
          tool_name: tool,
          params: args,
          proposal_id: proposalId,
          consensus_approved: false,
          consensus_votes: consensusVotes,
          success: false,
          error_message: 'Consensus not reached',
        });
        throw new Error('Consensus rejected this MCP call');
      }
    }

    const startTime = Date.now();
    let result: unknown;
    let success = true;
    let errorMessage: string | null = null;

    try {
      result = await this.executeMCPCall(mcpServer.url, tool, args);
    } catch (error: unknown) {
      success = false;
      errorMessage = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      const executionTime = Date.now() - startTime;

      await supabase.from('mcp_calls').insert({
        agent_id: agentId,
        mcp_server: server,
        tool_name: tool,
        params: args,
        proposal_id: proposalId,
        consensus_approved: consensusApproved || null,
        consensus_votes: consensusVotes,
        result,
        success,
        error_message: errorMessage,
        execution_time_ms: executionTime,
      });

      if (proposalId && this.ffpMode) {
        await supabase.from('chain_logs').insert({
          agent_id: agentId,
          action: 'mcp_call',
          data: { server, tool, params: args, proposal_id: proposalId, consensus_votes: consensusVotes, result, success },
        });
      }
    }

    return result;
  }

  private async proposeToConsensus(params: {
    agentId: string;
    action: string;
    server: string;
    tool: string;
    arguments: unknown;
  }) {
    const { data: proposal } = await supabase
      .from('proposals')
      .insert({
        agent_id: params.agentId,
        action: params.action,
        params: { server: params.server, tool: params.tool, arguments: params.arguments },
        confidence: 0.85,
        reasoning: `MCP call to ${params.server}.${params.tool}`,
      })
      .select()
      .single();

    return proposal as { id: string };
  }

  private async waitForConsensus(proposalId: string) {
    // Allow 3 seconds for agents to vote
    await new Promise(resolve => setTimeout(resolve, 3000));

    const { data: votes } = await supabase
      .from('votes')
      .select('*')
      .eq('proposal_id', proposalId);

    const approvals = votes?.filter(v => v.vote === 'approve').length ?? 0;
    const total = votes?.length ?? 0;
    const threshold = 0.67;
    const approved = total > 0 && approvals / total >= threshold;

    return { approved, votes: votes ?? [], threshold, approvals, total };
  }

  private async executeMCPCall(serverUrl: string, tool: string, args: unknown) {
    const response = await fetch(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: tool, arguments: args },
        id: 1,
      }),
    });

    const data = (await response.json()) as { error?: { message: string }; result?: unknown };
    if (data.error) throw new Error(data.error.message);
    return data.result;
  }
}
