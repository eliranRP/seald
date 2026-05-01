/**
 * Port for the Supabase Admin "delete user" call. The HTTP adapter
 * lives in `supabase-admin.client.http.ts`; tests substitute a stub.
 *
 * The port intentionally exposes only what `MeService` needs — there is
 * no `createUser` / `listUsers`. If a future feature needs more admin
 * surface we extend this port; we never reach for the raw HTTP client.
 */
export abstract class SupabaseAdminClient {
  /**
   * Idempotent on the wire: Supabase returns 200 when the user existed
   * and was deleted, and 404 when the user no longer exists. The
   * adapter must treat both as success so retried T-20 calls don't
   * loop. Any other non-2xx (auth, network, 5xx) MUST throw
   * `SupabaseAdminError`.
   */
  abstract deleteUser(userId: string): Promise<void>;
}

export class SupabaseAdminError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'SupabaseAdminError';
  }
}
