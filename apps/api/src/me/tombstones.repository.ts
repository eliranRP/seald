/**
 * Issues #38 / #43 — write-side port for the `deleted_user_tombstones`
 * table created in migration 0012. Kept tiny on purpose: MeService is
 * the only caller, and the table is append-only forensic bookkeeping
 * (no read API needed today).
 */
export abstract class TombstonesRepository {
  /**
   * Record that an account was deleted. `email_hash` MUST be the
   * lowercase SHA-256 hex digest of the user's email at the time of
   * deletion. Idempotent — re-runs of the deletion path overwrite the
   * timestamp but never throw.
   */
  abstract recordDeletion(input: {
    readonly user_id: string;
    readonly email_hash: string;
  }): Promise<void>;
}
