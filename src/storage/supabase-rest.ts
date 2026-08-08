import { getSupabaseServiceRoleKey, getSupabaseUrl } from '../config/env.js';

export async function supabaseRestRows(
  table: string,
  params: Record<string, string | number | boolean | null | undefined>,
  timeoutMs = 4_000,
): Promise<Array<Record<string, unknown>>> {
  const url = new URL(`${getSupabaseUrl().replace(/\/+$/, '')}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  const serviceRoleKey = getSupabaseServiceRoleKey();
  const timeout = (globalThis.AbortSignal as typeof AbortSignal & { timeout?: (ms: number) => AbortSignal }).timeout;
  const response = await fetch(url, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
    signal: typeof timeout === 'function' ? timeout(timeoutMs) : undefined,
  });
  if (!response.ok) {
    throw new Error(`Supabase REST read failed for ${table} with status ${response.status}`);
  }
  if (response.status === 204) return [];
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? rows as Array<Record<string, unknown>> : [];
}
