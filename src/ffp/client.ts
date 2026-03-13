/**
 * FFP Integration Client — Furge Fabric Protocol
 *
 * Provides two capabilities when FFP_MODE=enabled:
 *   1. ffpLog()       — fire-and-forget audit trail on FFP chains
 *   2. ffpConsensus() — blocking consensus gate for critical operations
 *
 * When FFP_MODE is absent or not "enabled", all calls are no-ops with
 * zero overhead. Existing deployments are completely unaffected.
 */

export interface FFPConfig {
  enabled: boolean;
  chainId: string;
  nodeUrl: string;
  agentId: string;
  requireConsensus: boolean;
}

export interface FFPOperation {
  primitive: 'fs' | 'net' | 'proc' | 'mem' | 'db' | 'events';
  action: string;
  params: Record<string, unknown>;
  result: Record<string, unknown>;
  timestamp: number;
  agentId: string;
}

export interface FFPProposal {
  operation: string;
  params: Record<string, unknown>;
  confidence: number;
}

// Domains that trigger consensus checks when FFP_REQUIRE_CONSENSUS=true
const CONSENSUS_DOMAINS = [
  'binance.com',
  'coinbase.com',
  'kraken.com',
  'stripe.com',
  'paypal.com',
  'braintreepayments.com',
];

let instance: FFPClient | null = null;

class FFPClient {
  readonly config: FFPConfig;

  constructor(config: FFPConfig) {
    this.config = config;
  }

  /**
   * Log an operation to the FFP chain.
   * Fire-and-forget — never throws, never blocks the caller.
   */
  async log(op: FFPOperation): Promise<void> {
    if (!this.config.enabled) return;

    try {
      await this.post('/submit', {
        type: 'agent_operation',
        chain: this.config.chainId,
        data: op,
      });
    } catch (err) {
      // Audit failure must never break the primary operation
      console.error('[ffp] log failed:', (err as Error).message);
    }
  }

  /**
   * Request FFP consensus for a critical operation.
   * Returns true (approved) when:
   *   - FFP is disabled, OR
   *   - require_consensus is false, OR
   *   - the FFP network approves the proposal
   * Returns false if the network rejects it.
   * Throws on timeout (30 s).
   */
  async consensus(proposal: FFPProposal): Promise<boolean> {
    if (!this.config.enabled || !this.config.requireConsensus) return true;

    const { proposal_id } = await this.post('/propose', {
      agent_id: this.config.agentId,
      proposal,
    }) as { proposal_id: string };

    return this.poll(proposal_id);
  }

  /** True if the given URL hits a consensus-gated domain. */
  isCriticalUrl(url: string): boolean {
    return CONSENSUS_DOMAINS.some(d => url.includes(d));
  }

  /**
   * Query the FFP chain for stored operations belonging to an agent.
   * Returns an empty array when FFP is disabled.
   */
  async queryOperations(params: {
    agentId: string;
    chainId?: string;
    startTime?: number;
    endTime?: number;
  }): Promise<FFPOperation[]> {
    if (!this.config.enabled) return [];

    const qs = new URLSearchParams({ agent_id: params.agentId });
    if (params.chainId) qs.set('chain_id', params.chainId);
    if (params.startTime) qs.set('start_time', String(params.startTime));
    if (params.endTime) qs.set('end_time', String(params.endTime));

    const res = await fetch(`${this.config.nodeUrl}/operations?${qs}`, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) throw new Error(`FFP query failed: ${res.status}`);
    const body = await res.json() as { operations: FFPOperation[] };
    return body.operations ?? [];
  }

  /**
   * Query consensus proposal history for an agent.
   */
  async queryConsensusHistory(agentId: string): Promise<unknown[]> {
    if (!this.config.enabled) return [];

    const res = await fetch(
      `${this.config.nodeUrl}/consensus/history?agent_id=${encodeURIComponent(agentId)}`,
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (!res.ok) throw new Error(`FFP consensus query failed: ${res.status}`);
    const body = await res.json() as { proposals: unknown[] };
    return body.proposals ?? [];
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async post(path: string, data: unknown): Promise<unknown> {
    const res = await fetch(`${this.config.nodeUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`FFP ${path} returned ${res.status}`);
    return res.json();
  }

  private async poll(proposalId: string, attempts = 30): Promise<boolean> {
    for (let i = 0; i < attempts; i++) {
      await new Promise(r => setTimeout(r, 1000));

      const res = await fetch(
        `${this.config.nodeUrl}/consensus/${encodeURIComponent(proposalId)}`
      );
      if (!res.ok) continue;

      const body = await res.json() as { status: string; approved: boolean };
      if (body.status === 'finalized') return body.approved;
    }
    throw new Error(`FFP consensus timeout for proposal ${proposalId}`);
  }
}

/**
 * Returns the shared FFPClient instance (created once from env vars).
 * Safe to call from any primitive — no-ops when FFP_MODE != "enabled".
 */
export function getFFPClient(): FFPClient {
  if (!instance) {
    instance = new FFPClient({
      enabled: process.env.FFP_MODE === 'enabled',
      chainId: process.env.FFP_CHAIN_ID ?? '',
      nodeUrl: (process.env.FFP_NODE_URL ?? '').replace(/\/$/, ''),
      agentId: process.env.FFP_AGENT_ID ?? '',
      requireConsensus: process.env.FFP_REQUIRE_CONSENSUS === 'true',
    });

    if (instance.config.enabled) {
      console.log(
        `[ffp] mode=enabled chain=${instance.config.chainId} node=${instance.config.nodeUrl}`
      );
    }
  }
  return instance;
}

/** Reset singleton — used in tests only. */
export function _resetFFPClient(): void {
  instance = null;
}
