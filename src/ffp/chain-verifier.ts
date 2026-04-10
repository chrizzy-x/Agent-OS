/**
 * FFP Chain Verifier
 *
 * Validates consensus proofs submitted by FFP chain coordinators before
 * AgentOS executes any tool call on their behalf.
 *
 * Signature scheme:
 *   chainSecret  = HMAC-SHA256(ENCRYPTION_KEY, chainId)
 *   message      = proposalId|chainId|agentId|tool|inputHash|threshold|timestamp
 *   signature    = HMAC-SHA256(message, chainSecret)
 *
 * Multiple validators each sign the same message independently.
 * Execution is approved when at least `threshold` valid unique signatures
 * are present and the proof has not expired.
 */

import { createHmac, createHash } from 'crypto';

export interface ConsensusProof {
  /** Unique ID of the consensus proposal on the FFP chain */
  proposalId: string;
  /** Which FFP sector chain this request originates from */
  chainId: string;
  /** Agent ID on the FFP chain */
  agentId: string;
  /** Tool being executed e.g. "agentos.net_http_get" */
  tool: string;
  /** SHA-256 hex digest of JSON.stringify(input) — prevents tampering */
  inputHash: string;
  /** Minimum number of valid signatures required */
  threshold: number;
  /** Unix timestamp in seconds when proof was created */
  timestamp: number;
  /** HMAC-SHA256 signatures from chain validators */
  signatures: string[];
}

export type VerificationResult =
  | { valid: true }
  | { valid: false; reason: string };

const PROOF_MAX_AGE_SECONDS = 300; // 5 minutes

function getMasterSecret(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY is not configured');
  return key;
}

/** Derives a deterministic secret for a specific FFP chain */
function deriveChainSecret(chainId: string): string {
  return createHmac('sha256', getMasterSecret())
    .update(`ffp:chain:${chainId}`)
    .digest('hex');
}

/** Builds the canonical message string that validators sign */
function buildMessage(proof: Omit<ConsensusProof, 'signatures'>): string {
  return [
    proof.proposalId,
    proof.chainId,
    proof.agentId,
    proof.tool,
    proof.inputHash,
    proof.threshold,
    proof.timestamp,
  ].join('|');
}

/** Computes SHA-256 hex digest of the serialised input object */
export function hashInput(input: unknown): string {
  const serialised = JSON.stringify(input ?? {});
  return createHash('sha256').update(serialised).digest('hex');
}

/** Verifies a single HMAC signature against the canonical message */
function verifySignature(message: string, signature: string, chainSecret: string): boolean {
  const expected = createHmac('sha256', chainSecret).update(message).digest('hex');
  // Constant-time comparison to prevent timing attacks
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Verifies a ConsensusProof before execution.
 * Returns { valid: true } or { valid: false, reason: string }.
 */
export function verifyConsensusProof(
  proof: ConsensusProof,
  actualInput: unknown,
): VerificationResult {
  // 1. Structural validation
  if (!proof.proposalId || !proof.chainId || !proof.agentId || !proof.tool) {
    return { valid: false, reason: 'Proof is missing required fields' };
  }
  if (!Array.isArray(proof.signatures) || proof.signatures.length === 0) {
    return { valid: false, reason: 'Proof contains no signatures' };
  }
  if (typeof proof.threshold !== 'number' || proof.threshold < 1) {
    return { valid: false, reason: 'Invalid consensus threshold' };
  }

  // 2. Expiry check
  const nowSeconds = Math.floor(Date.now() / 1000);
  const age = nowSeconds - proof.timestamp;
  if (age < 0 || age > PROOF_MAX_AGE_SECONDS) {
    return { valid: false, reason: `Proof has expired (age: ${age}s, max: ${PROOF_MAX_AGE_SECONDS}s)` };
  }

  // 3. Input integrity — proof must commit to the same input being executed
  const computedHash = hashInput(actualInput);
  if (computedHash !== proof.inputHash) {
    return { valid: false, reason: 'Input hash mismatch — proof does not match submitted input' };
  }

  // 4. Signature verification
  const chainSecret = deriveChainSecret(proof.chainId);
  const message = buildMessage(proof);
  const seen = new Set<string>();
  let validCount = 0;

  for (const sig of proof.signatures) {
    if (seen.has(sig)) continue; // deduplicate
    seen.add(sig);
    if (verifySignature(message, sig, chainSecret)) {
      validCount++;
    }
  }

  if (validCount < proof.threshold) {
    return {
      valid: false,
      reason: `Insufficient valid signatures: ${validCount}/${proof.threshold} required`,
    };
  }

  return { valid: true };
}

/**
 * Utility — generate a valid signature for a proof.
 * Used by FFP chain coordinators / test harnesses to sign proofs.
 */
export function signProof(
  proof: Omit<ConsensusProof, 'signatures'>,
  chainId: string,
): string {
  const chainSecret = deriveChainSecret(chainId);
  const message = buildMessage(proof);
  return createHmac('sha256', chainSecret).update(message).digest('hex');
}
