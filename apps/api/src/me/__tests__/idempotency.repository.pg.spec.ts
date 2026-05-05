import { randomUUID } from 'node:crypto';
import { createPgMemDb, seedUser, type PgMemHandle } from '../../../test/pg-mem-db';
import { IdempotencyPgRepository } from '../idempotency.repository.pg';

/**
 * Coverage for the Postgres adapter behind `IdempotencyRepository`. The
 * port has a single method (`deleteByUser`) used by T-20 to wipe stale
 * idempotency rows during account deletion (FK doesn't cascade, so
 * leaving them behind would orphan records the user can never reach).
 *
 * Behaviors covered:
 *   - returns 0 when the user has no rows
 *   - returns the actual count when rows exist
 *   - scopes the delete to user_id (other users' rows are untouched)
 */
async function insertRow(handle: PgMemHandle, user_id: string, key = randomUUID()): Promise<void> {
  await handle.db
    .insertInto('idempotency_records')
    .values({
      user_id,
      idempotency_key: key,
      method: 'POST',
      path: '/envelopes',
      request_hash: 'h',
      response_status: 201,
      response_body: JSON.stringify({}),
      expires_at: '2099-01-01T00:00:00.000Z',
    })
    .execute();
}

describe('IdempotencyPgRepository', () => {
  let handle: PgMemHandle;
  let repo: IdempotencyPgRepository;
  let userA: string;
  let userB: string;

  beforeEach(async () => {
    handle = createPgMemDb();
    userA = await seedUser(handle);
    userB = await seedUser(handle);
    repo = new IdempotencyPgRepository(handle.db);
  });

  afterEach(async () => {
    await handle.close();
  });

  it('returns 0 when the user has no idempotency rows', async () => {
    const out = await repo.deleteByUser(userA);
    expect(out).toBe(0);
  });

  it('returns the deleted-row count when rows exist', async () => {
    await insertRow(handle, userA);
    await insertRow(handle, userA);
    await insertRow(handle, userA);

    const out = await repo.deleteByUser(userA);
    expect(out).toBe(3);

    const after = await handle.db
      .selectFrom('idempotency_records')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('user_id', '=', userA)
      .executeTakeFirstOrThrow();
    expect(Number(after.n)).toBe(0);
  });

  it("scopes the delete to user_id — other users' rows survive", async () => {
    await insertRow(handle, userA);
    await insertRow(handle, userB);
    await insertRow(handle, userB);

    const out = await repo.deleteByUser(userA);
    expect(out).toBe(1);

    // userB's rows untouched.
    const remaining = await handle.db
      .selectFrom('idempotency_records')
      .selectAll()
      .where('user_id', '=', userB)
      .execute();
    expect(remaining).toHaveLength(2);
  });
});
