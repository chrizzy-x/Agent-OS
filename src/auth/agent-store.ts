import { getSupabaseAdmin } from '../storage/supabase.js';
import { readLocalRuntimeState, updateLocalRuntimeState, type LocalAccountRecord } from '../storage/local-state.js';
import { cleanAgentDisplayName, normalizeAgentDisplayName } from './agent-names.js';
import { normalizePlan, PLAN_ACCOUNT_TYPE, toPersistedTier, type AccountType, type AgentPlan } from './tiers.js';

const AUTH_STORE_QUERY_TIMEOUT_MS = 10_000;
const AUTH_STORE_QUERY_ATTEMPTS = 3;
const AUTH_STORE_RETRY_DELAY_MS = 250;
const DEFAULT_AUTH_STORE_FALLBACK_CACHE_TTL_MS = 120_000;

const authLookupCache = new Map<string, { accounts: AgentAccount[]; cachedAt: number }>();

export class AuthStoreUnavailableError extends Error {
  constructor(message = 'Authentication store is temporarily unavailable') {
    super(message);
    this.name = 'AuthStoreUnavailableError';
  }
}

export function isAuthStoreUnavailableError(error: unknown): boolean {
  return error instanceof AuthStoreUnavailableError;
}

export function authStoreUnavailableResponse(): { error: string; message: string } {
  return {
    error: 'auth_store_unavailable',
    message: 'Authentication is temporarily unavailable. Try again in a moment.',
  };
}

export type AgentAccount = {
  id: string;
  name: string;
  email: string;
  passwordHash: string | null;
  metadata: Record<string, unknown>;
};

export type CreateAgentAccountInput = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  tier?: AgentPlan;
  plan?: AgentPlan;
  accountType?: AccountType | null;
  planSelectionSkipped?: boolean;
};

function authStoreFallbackCacheTtlMs(): number {
  const configured = Number(process.env.AGENTOS_AUTH_STORE_FALLBACK_CACHE_TTL_MS);
  if (!Number.isFinite(configured)) return DEFAULT_AUTH_STORE_FALLBACK_CACHE_TTL_MS;
  return Math.max(0, Math.min(Math.floor(configured), 300_000));
}

function normalizeAuthStoreEmail(email: string): string {
  return email.trim().toLowerCase();
}

function cloneAccounts(accounts: AgentAccount[]): AgentAccount[] {
  return accounts.map(account => ({
    ...account,
    metadata: { ...account.metadata },
  }));
}

function cacheAccountsByEmail(email: string, accounts: AgentAccount[]): void {
  const ttl = authStoreFallbackCacheTtlMs();
  if (ttl <= 0 || accounts.length === 0) return;
  authLookupCache.set(email, {
    accounts: cloneAccounts(accounts),
    cachedAt: Date.now(),
  });
}

function getCachedAccountsByEmail(email: string): AgentAccount[] | null {
  const ttl = authStoreFallbackCacheTtlMs();
  if (ttl <= 0) return null;
  const cached = authLookupCache.get(email);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > ttl) {
    authLookupCache.delete(email);
    return null;
  }
  return cloneAccounts(cached.accounts);
}

export type CreateAgentAccountResult = {
  duplicate: boolean;
  conflictField?: 'email' | 'name' | 'id' | 'unknown';
};

function inferDuplicateField(error: { message?: string; details?: string; hint?: string }): CreateAgentAccountResult['conflictField'] {
  const text = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase();
  if (text.includes('email')) return 'email';
  if (text.includes('name')) return 'name';
  if (text.includes('id') || text.includes('agents_pkey')) return 'id';
  return 'unknown';
}

function mapLocalAccount(record: LocalAccountRecord): AgentAccount {
  return {
    id: record.agentId,
    name: record.agentName,
    email: record.email,
    passwordHash: record.passwordHash,
    metadata: {
      ...(record.passwordReset ? { password_reset: record.passwordReset } : {}),
      ...(record.avatarUrl ? { avatar_url: record.avatarUrl } : {}),
      plan: record.plan ?? 'retail_free',
      account_type: record.accountType ?? 'retail',
      account_intent: record.accountType ?? 'retail',
    },
  };
}

function mapSupabaseAccount(row: Record<string, unknown>): AgentAccount {
  const metadata = ((row.metadata as Record<string, unknown> | null | undefined) ?? {});
  return {
    id: String(row.id),
    name: typeof row.name === 'string' ? row.name : String(row.id),
    email: typeof metadata.email === 'string' ? metadata.email : '',
    passwordHash: typeof metadata.password_hash === 'string' ? metadata.password_hash : null,
    metadata,
  };
}

function applyAuthStoreQueryTimeout<T>(query: T): T {
  const timeout = (globalThis.AbortSignal as typeof AbortSignal & { timeout?: (ms: number) => AbortSignal }).timeout;
  const abortable = query as T & { abortSignal?: (signal: AbortSignal) => T };
  return typeof timeout === 'function' && typeof abortable.abortSignal === 'function'
    ? abortable.abortSignal(timeout(AUTH_STORE_QUERY_TIMEOUT_MS))
    : query;
}

async function readLocalAccounts(): Promise<AgentAccount[]> {
  const state = await readLocalRuntimeState();
  return Object.values(state.accounts).map(mapLocalAccount);
}

function waitForAuthStoreRetry(attempt: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, AUTH_STORE_RETRY_DELAY_MS * attempt));
}

export async function findAccountsByEmail(email: string): Promise<AgentAccount[]> {
  const lookupEmail = normalizeAuthStoreEmail(email);
  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    const accounts = await readLocalAccounts();
    return accounts.filter(account => normalizeAuthStoreEmail(account.email) === lookupEmail);
  }

  for (let attempt = 1; attempt <= AUTH_STORE_QUERY_ATTEMPTS; attempt += 1) {
    try {
      const { data, error } = await applyAuthStoreQueryTimeout(supabase
        .from('agents')
        .select('id, name, metadata')
        .eq('metadata->>email', lookupEmail)
        .limit(10));

      if (!error) {
        const accounts = ((data ?? []) as Record<string, unknown>[]).map(mapSupabaseAccount);
        cacheAccountsByEmail(lookupEmail, accounts);
        return accounts;
      }
    } catch {
      // Retry below.
    }

    if (attempt < AUTH_STORE_QUERY_ATTEMPTS) {
      await waitForAuthStoreRetry(attempt);
    }
  }

  const cachedAccounts = getCachedAccountsByEmail(lookupEmail);
  if (cachedAccounts) return cachedAccounts;

  throw new AuthStoreUnavailableError();
}

export async function findAccountById(agentId: string): Promise<AgentAccount | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await applyAuthStoreQueryTimeout(supabase
      .from('agents')
      .select('id, name, metadata')
      .eq('id', agentId)
      .maybeSingle());

    if (!error && data) {
      return mapSupabaseAccount(data as Record<string, unknown>);
    }
  } catch {
    // Fall back to local state below.
  }

  const accounts = await readLocalAccounts();
  return accounts.find(account => account.id === agentId) ?? null;
}

export async function createAgentAccount(input: CreateAgentAccountInput): Promise<CreateAgentAccountResult> {
  const plan = input.plan ?? normalizePlan(input.tier);
  const accountType = input.accountType ?? PLAN_ACCOUNT_TYPE[plan];
  const name = cleanAgentDisplayName(input.name);
  try {
    const supabase = getSupabaseAdmin();
    const payload = {
      id: input.id,
      name,
      tier: toPersistedTier(plan),
      quotas: {},
      metadata: {
        email: input.email,
        password_hash: input.passwordHash,
        signup_source: 'web',
        account_type: accountType,
        account_intent: accountType,
        plan,
        plan_price_usd: 0,
        plan_selection_skipped: Boolean(input.planSelectionSkipped),
      },
    };
    const { error } = await applyAuthStoreQueryTimeout(supabase.from('agents').insert(payload));

    if (!error) {
      return { duplicate: false };
    }

    if (error.code === '23505') {
      return { duplicate: true, conflictField: inferDuplicateField(error) };
    }
  } catch {
    // Fall back to local state below.
  }

  return updateLocalRuntimeState(state => {
    const normalizedName = normalizeAgentDisplayName(name);
    const existingEmail = Object.values(state.accounts).some(account => account.email === input.email);
    if (existingEmail) {
      return { duplicate: true, conflictField: 'email' };
    }

    const existingId = Boolean(state.accounts[input.id] || state.externalAgents[input.id]);
    if (existingId) {
      return { duplicate: true, conflictField: 'id' };
    }

    const existingName = normalizedName
      ? Object.values(state.accounts).some(account => normalizeAgentDisplayName(account.agentName) === normalizedName)
        || Object.values(state.externalAgents).some(agent => normalizeAgentDisplayName(agent.name) === normalizedName)
      : false;
    if (existingName) {
      return { duplicate: true, conflictField: 'name' };
    }

    const now = new Date().toISOString();
    state.accounts[input.id] = {
      agentId: input.id,
      email: input.email,
      agentName: name,
      passwordHash: input.passwordHash,
      plan,
      accountType,
      createdAt: now,
      updatedAt: now,
      passwordReset: null,
    };

    return { duplicate: false };
  });
}

export async function setPasswordResetToken(
  email: string,
  tokenHash: string,
  expiresAt: string,
  requestedAt: string,
): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await applyAuthStoreQueryTimeout(supabase
      .from('agents')
      .select('id, metadata')
      .eq('metadata->>email', email)
      .limit(2));

    if (!error && Array.isArray(data)) {
      if (data.length !== 1) {
        return data.length === 0;
      }

      const agent = data[0] as Record<string, unknown>;
      const metadata = ((agent.metadata as Record<string, unknown> | null | undefined) ?? {});
      const nextMetadata = {
        ...metadata,
        password_reset: {
          token_hash: tokenHash,
          expires_at: expiresAt,
          requested_at: requestedAt,
        },
      };

      const update = await applyAuthStoreQueryTimeout(supabase.from('agents').update({ metadata: nextMetadata }).eq('id', agent.id));
      return !update.error;
    }
  } catch {
    // Fall back to local state below.
  }

  return updateLocalRuntimeState(state => {
    const account = Object.values(state.accounts).find(item => item.email === email);
    if (!account) {
      return true;
    }

    account.passwordReset = {
      token_hash: tokenHash,
      expires_at: expiresAt,
      requested_at: requestedAt,
    };
    account.updatedAt = new Date().toISOString();
    return true;
  });
}
