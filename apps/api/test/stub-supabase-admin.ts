import { SupabaseAdminClient, SupabaseAdminError } from '../src/me/supabase-admin.client';

/**
 * Stub for the Supabase Admin client. Records every `deleteUser` call so
 * tests can assert ordering against a sibling stub (e.g. the idempotency
 * wipe runs strictly before the admin call). Optionally throws on the
 * next call to exercise the error-mapping path in `MeService`.
 */
export class StubSupabaseAdminClient extends SupabaseAdminClient {
  /** Each entry is `{ userId, at }` in call-order. */
  readonly deletedUserIds: string[] = [];
  /** Shared call log used to assert global call ordering across stubs. */
  callLog: string[] | null = null;
  /**
   * If non-null, the next call to deleteUser throws this error and the
   * field is reset to null. Used to test 503 mapping.
   */
  errorOnNext: Error | null = null;

  reset(): void {
    this.deletedUserIds.length = 0;
    this.errorOnNext = null;
  }

  /**
   * Convenience: arm the next call to throw a SupabaseAdminError so the
   * service maps it to ServiceUnavailableException.
   */
  failNextWithAdminError(message = 'simulated admin failure', status = 500): void {
    this.errorOnNext = new SupabaseAdminError(message, status);
  }

  /**
   * Convenience: arm the next call to throw a non-admin Error so the
   * service rethrows verbatim.
   */
  failNextWithUnknownError(message = 'simulated boom'): void {
    this.errorOnNext = new Error(message);
  }

  async deleteUser(userId: string): Promise<void> {
    if (this.callLog) this.callLog.push('supabaseAdmin.deleteUser');
    if (this.errorOnNext) {
      const e = this.errorOnNext;
      this.errorOnNext = null;
      throw e;
    }
    this.deletedUserIds.push(userId);
  }
}
