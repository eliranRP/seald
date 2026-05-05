import { createHash } from 'node:crypto';
import { createPgMemDb, seedUser, type PgMemHandle } from '../../../test/pg-mem-db';
import { TombstonesPgRepository } from '../tombstones.repository.pg';

/**
 * Coverage for the Postgres adapter behind `TombstonesRepository`.
 *
 * Tombstones are the forensic breadcrumb that survives account deletion
 * (issues #38/#43). The contract is a single `recordDeletion` upsert:
 *
 *   - first call inserts a new row keyed on user_id
 *   - subsequent calls upsert: refresh email_hash + bump deleted_at,
 *     never raise a 23505 (so the calling DSAR pipeline stays
 *     idempotent — an admin retry must converge cleanly)
 *
 * Both branches are required to satisfy MeService.deleteAccount step 5
 * "tombstone BEFORE supabase admin so a partial failure leaves a
 * recoverable state".
 */
const HASH = (email: string): string =>
  createHash('sha256').update(email.toLowerCase()).digest('hex');

describe('TombstonesPgRepository', () => {
  let handle: PgMemHandle;
  let repo: TombstonesPgRepository;
  let userId: string;

  beforeEach(async () => {
    handle = createPgMemDb();
    userId = await seedUser(handle);
    repo = new TombstonesPgRepository(handle.db);
  });

  afterEach(async () => {
    await handle.close();
  });

  it('inserts a new tombstone row keyed on user_id', async () => {
    const hash = HASH('maya@example.com');
    await repo.recordDeletion({ user_id: userId, email_hash: hash });

    const rows = await handle.db
      .selectFrom('deleted_user_tombstones')
      .selectAll()
      .where('user_id', '=', userId)
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email_hash).toBe(hash);
  });

  it('upserts on conflict — second call refreshes email_hash without raising', async () => {
    const oldHash = HASH('old@example.com');
    const newHash = HASH('new@example.com');

    await repo.recordDeletion({ user_id: userId, email_hash: oldHash });
    // T-20 retry path: same user_id, possibly different email_hash. Must
    // not raise — the pipeline depends on idempotency.
    await expect(
      repo.recordDeletion({ user_id: userId, email_hash: newHash }),
    ).resolves.toBeUndefined();

    const rows = await handle.db
      .selectFrom('deleted_user_tombstones')
      .selectAll()
      .where('user_id', '=', userId)
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email_hash).toBe(newHash);
  });
});
