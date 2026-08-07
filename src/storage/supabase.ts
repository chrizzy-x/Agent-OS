import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServiceRoleKey, getSupabaseUrl } from '../config/env.js';

let adminClient: SupabaseClient | null = null;

// Returns a Supabase client using the service role key (bypasses RLS).
// Used for all server-side operations - agents never get direct DB access.
export function getSupabaseAdmin(): SupabaseClient {
  if (!adminClient) {
    const url = getSupabaseUrl();
    const key = getSupabaseServiceRoleKey();

    adminClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return adminClient;
}

export function withSupabaseQueryTimeout<T>(query: T, timeoutMs = 4_000): T {
  const timeout = (globalThis.AbortSignal as typeof AbortSignal & { timeout?: (ms: number) => AbortSignal }).timeout;
  const abortable = query as T & { abortSignal?: (signal: AbortSignal) => T };
  return typeof timeout === 'function' && typeof abortable.abortSignal === 'function'
    ? abortable.abortSignal(timeout(timeoutMs))
    : query;
}

// Allow replacing the client in tests
export function setSupabaseClient(c: SupabaseClient): void {
  adminClient = c;
}

// Storage bucket name - single bucket with per-agent path prefixes
export const STORAGE_BUCKET = 'agent-files';

// Build the storage path for a file: {privateAgentRef}/{userPath}
export function storagePath(agentId: string, filePath: string): string {
  const clean = filePath.startsWith('/') ? filePath.slice(1) : filePath;
  return `${agentId}/${clean}`;
}
