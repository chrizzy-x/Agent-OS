import { getConsensusDefaultThreshold, getConsensusWaitMs, isFfpEnabled } from '../src/config/env.js';
import { getSupabaseAdmin } from '../src/storage/supabase.js';

type VoteRecord = { vote: string };

export class MCPRouter {
  private readonly ffpMode: boolean;
  private readonly defaultWaitMs: number;
  private readonly defaultThreshold: number;

  constructor() {
    this.ffpMode = isFfpEnabled();
    this.defaultWaitMs = getConsensusWaitMs();
    this.defaultThreshold = getConsensusDefaultThreshold();
  }

  async routeMCPCall(params: {
    agentId: string;
    server: string;
    tool: string;
    arguments: Record<string, unknown>;
  }) {
    const { agentId, server, tool, arguments: args } = params;
    const supabase = getSupabaseAdmin();

    const { data: mcpServer, error: serverError } = await supabase
      .from('mcp_servers')
      .select('*')
      .eq('name', server)
      .eq('active', true)
      .single();

    if (serverError || !mcpServer) {
      throw new Error(`MCP server '${server}' not found`);
    }

    let proposalId: string | null = null;
    let consensusApproved: boolean | null = null;
    let consensusVotes: unknown[] | null = null;

    if (this.ffpMode && mcpServer.requires_consensus) {
      const proposal = await this.proposeToConsensus({ agentId, action: 'mcp_call', server, tool, arguments: args });
      proposalId = proposal.id;

      const consensus = await this.waitForConsensus(proposal.id, mcpServer.consensus_threshold ?? this.defaultThreshold);
      consensusApproved = consensus.approved;
      consensusVotes = consensus.votes;

      await supabase
        .from('proposals')
        .update({ status: consensus.approved ? 'approved' : 'rejected' })
        .eq('id', proposal.id);

      if (!consensus.approved) {
        await this.recordMcpCall({
          agentId,
          server,
          tool,
          args,
          proposalId,
          consensusApproved: false,
          consensusVotes,
          success: false,
          errorMessage: 'Consensus not reached',
          executionTimeMs: 0,
        });

        throw new Error('Consensus rejected this MCP call');
      }
    }

    const startedAt = Date.now();

    try {
      const result = await this.executeMCPCall(mcpServer.url, tool, args);
      const executionTimeMs = Date.now() - startedAt;

      await this.recordMcpCall({
        agentId,
        server,
        tool,
        args,
        proposalId,
        consensusApproved,
        consensusVotes,
        success: true,
        result,
        executionTimeMs,
      });

      return result;
    } catch (error: unknown) {
      const executionTimeMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : 'Unknown MCP error';

      if (proposalId && this.ffpMode) {
        await supabase.from('proposals').update({ status: 'failed' }).eq('id', proposalId);
      }

      await this.recordMcpCall({
        agentId,
        server,
        tool,
        args,
        proposalId,
        consensusApproved,
        consensusVotes,
        success: false,
        errorMessage: message,
        executionTimeMs,
      });

      throw error;
    }
  }

  private async proposeToConsensus(params: {
    agentId: string;
    action: string;
    server: string;
    tool: string;
    arguments: unknown;
  }) {
    const supabase = getSupabaseAdmin();
    const { data: proposal, error } = await supabase
      .from('proposals')
      .insert({
        agent_id: params.agentId,
        action: params.action,
        params: { server: params.server, tool: params.tool, arguments: params.arguments },
        confidence: 0.85,
        reasoning: `MCP call to ${params.server}.${params.tool}`,
        status: 'pending',
      })
      .select('id')
      .single();

    if (error || !proposal) {
      throw new Error('Failed to create consensus proposal');
    }

    return proposal as { id: string };
  }

  private async waitForConsensus(proposalId: string, threshold: number) {
    await new Promise(resolve => setTimeout(resolve, this.defaultWaitMs));

    const supabase = getSupabaseAdmin();
    const { data: votes } = await supabase
      .from('votes')
      .select('vote')
      .eq('proposal_id', proposalId);

    const approvals = (votes ?? []).filter((vote: VoteRecord) => vote.vote === 'approve').length;
    const total = votes?.length ?? 0;
    const approved = total > 0 && approvals / total >= threshold;

    return {
      approved,
      votes: votes ?? [],
      threshold,
      approvals,
      total,
    };
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

    if (!response.ok) {
      throw new Error(`Remote MCP server returned ${response.status}`);
    }

    const data = await response.json() as { error?: { message: string }; result?: unknown };
    if (data.error) {
      throw new Error(data.error.message);
    }
    return data.result;
  }

  private async recordMcpCall(params: {
    agentId: string;
    server: string;
    tool: string;
    args: Record<string, unknown>;
    proposalId: string | null;
    consensusApproved: boolean | null;
    consensusVotes: unknown[] | null;
    success: boolean;
    result?: unknown;
    errorMessage?: string;
    executionTimeMs: number;
  }) {
    const supabase = getSupabaseAdmin();

    await supabase.from('mcp_calls').insert({
      agent_id: params.agentId,
      mcp_server: params.server,
      tool_name: params.tool,
      params: params.args,
      proposal_id: params.proposalId,
      consensus_approved: params.consensusApproved,
      consensus_votes: params.consensusVotes,
      result: params.result ?? null,
      success: params.success,
      error_message: params.errorMessage ?? null,
      execution_time_ms: params.executionTimeMs,
    });

    if (params.proposalId && this.ffpMode) {
      await supabase.from('chain_logs').insert({
        agent_id: params.agentId,
        action: 'mcp_call',
        data: {
          server: params.server,
          tool: params.tool,
          params: params.args,
          proposal_id: params.proposalId,
          consensus_votes: params.consensusVotes,
          result: params.result ?? null,
          success: params.success,
          error: params.errorMessage ?? null,
        },
      });
    }
  }
}

