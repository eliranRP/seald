/**
 * Port for the slice of `idempotency_records` that T-20 needs. The
 * full idempotency feature has its own home (request middleware), but
 * its FK does not cascade on `auth.users(id)` deletion, so the
 * account-deletion flow has to wipe rows itself.
 */
export abstract class IdempotencyRepository {
  /** Returns the number of rows deleted. Idempotent. */
  abstract deleteByUser(user_id: string): Promise<number>;
}
