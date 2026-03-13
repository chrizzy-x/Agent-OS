import { createClient, SupabaseClient } from '@supabase/supabase-js';

let adminClient: SupabaseClient | null = null;

// Returns a Supabase client using the service role key (bypasses RLS).
// Used for all server-side operations — agents never get direct DB access.
export function getSupabaseAdmin(): SupabaseClient {
  if (!adminClient) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;

    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required');
    }

    adminClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return adminClient;
}

// Allow replacing the client in tests
export function setSupabaseClient(c: SupabaseClient): void {
  adminClient = c;
}

// Storage bucket name — single bucket with per-agent path prefixes
export const STORAGE_BUCKET = 'agent-files';

// Build the storage path for a file: {agentId}/{userPath}
export function storagePath(agentId: string, filePath: string): string {
  // Ensure no leading slash and path is properly joined
  const clean = filePath.startsWith('/') ? filePath.slice(1) : filePath;
  return `${agentId}/${clean}`;
}
