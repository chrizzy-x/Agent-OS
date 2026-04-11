import { getSupabaseAdmin } from '../storage/supabase.js';
import { readLocalRuntimeState, updateLocalRuntimeState, type LocalAccountRecord } from '../storage/local-state.js';

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
};

function mapLocalAccount(record: LocalAccountRecord): AgentAccount {
  return {
    id: record.agentId,
    name: record.agentName,
    email: record.email,
    passwordHash: record.passwordHash,
    metadata: record.passwordReset ? { password_reset: record.passwordReset } : {},
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

async function readLocalAccounts(): Promise<AgentAccount[]> {
  const state = await readLocalRuntimeState();
  return Object.values(state.accounts).map(mapLocalAccount);
}

export async function findAccountsByEmail(email: string): Promise<AgentAccount[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('agents')
      .select('id, name, metadata', { count: 'exact' })
      .eq('metadata->>email', email)
      .limit(10);

    if (!error) {
      return ((data ?? []) as Record<string, unknown>[]).map(mapSupabaseAccount);
    }
  } catch {
    // Fall back to local state below.
  }

  const accounts = await readLocalAccounts();
  return accounts.filter(account => account.email === email);
}

export async function findAccountById(agentId: string): Promise<AgentAccount | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('agents')
      .select('id, name, metadata')
      .eq('id', agentId)
      .maybeSingle();

    if (!error && data) {
      return mapSupabaseAccount(data as Record<string, unknown>);
    }
  } catch {
    // Fall back to local state below.
  }

  const accounts = await readLocalAccounts();
  return accounts.find(account => account.id === agentId) ?? null;
}

export async function createAgentAccount(input: CreateAgentAccountInput): Promise<{ duplicate: boolean }> {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('agents').insert({
      id: input.id,
      name: input.name,
      tier: 'free',
      quotas: {},
      metadata: { email: input.email, password_hash: input.passwordHash, signup_source: 'web' },
    });

    if (!error) {
      return { duplicate: false };
    }

    if (error.code === '23505') {
      return { duplicate: true };
    }
  } catch {
    // Fall back to local state below.
  }

  return updateLocalRuntimeState(state => {
    const existing = Object.values(state.accounts).some(account => account.email === input.email || account.agentId === input.id);
    if (existing) {
      return { duplicate: true };
    }

    const now = new Date().toISOString();
    state.accounts[input.id] = {
      agentId: input.id,
      email: input.email,
      agentName: input.name,
      passwordHash: input.passwordHash,
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
    const { data, error } = await supabase
      .from('agents')
      .select('id, metadata')
      .eq('metadata->>email', email)
      .limit(2);

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

      const update = await supabase.from('agents').update({ metadata: nextMetadata }).eq('id', agent.id);
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
