import { isFeatureEnabled } from 'shared';
import { supabase } from './supabaseClient';

/** The owner list RPCs of migration 0050 (docs/supabase-native-architecture.md, step 4). */
export type OwnerReadRpc = 'seald_list_envelopes' | 'seald_list_contacts' | 'seald_list_templates';

/**
 * Reads the signed-in owner's list straight from Postgres while
 * `ownerReadRpcs` is on; each RPC returns the same JSON as the API route
 * it replaces. `viaApi` is that route. It runs instead when the flag is
 * off, when nobody is signed in, and when the RPC fails for any reason
 * (not deployed yet, expired session, network), so sign-out, rate-limit
 * and maintenance handling stay with the API client.
 */
export async function readViaOwnerRpc<T>(
  fn: OwnerReadRpc,
  args: Record<string, unknown> | undefined,
  signal: AbortSignal | undefined,
  viaApi: () => Promise<T>,
): Promise<T> {
  if (!isFeatureEnabled('ownerReadRpcs')) return viaApi();
  const { data: auth } = await supabase.auth.getSession();
  if (!auth.session) return viaApi();
  const call = supabase.rpc(fn, args);
  const { data, error } = await (signal ? call.abortSignal(signal) : call);
  if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
  if (error || data === null) return viaApi();
  return data as T;
}
