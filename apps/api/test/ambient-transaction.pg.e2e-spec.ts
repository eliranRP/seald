import { randomBytes } from 'node:crypto';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import {
  isInAmbientTransaction,
  runAfterCommit,
  runInAmbientTransaction,
  withAmbientTransactions,
} from '../src/db/ambient-transaction';

/**
 * The ambient transaction behind `DB_TOKEN` (WP-24) on real Postgres:
 * outside a scope nothing changes; inside one every query and every
 * nested `db.transaction()` share one transaction (savepoints), a throw
 * rolls everything back, and after-commit work waits for the outer
 * commit. Its own scratch database; skipped when
 * SUBMIT_SIGNER_DATABASE_URL is unset locally, fails in CI.
 */
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;
const DB_NAME = `ambient_tx_e2e_${randomBytes(4).toString('hex')}`;

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('SUBMIT_SIGNER_DATABASE_URL is required in CI for the ambient transaction e2e');
}
const describePg = databaseUrl ? describe : describe.skip;

interface Db {
  items: { id: string; note: string };
}

describePg('ambient transactions (e2e, real Postgres)', () => {
  let admin: Pool | undefined;
  let pool: Pool | undefined;
  let root: Kysely<Db>;
  let db: Kysely<Db>;
  let other: Pool | undefined;

  const ids = async (): Promise<string[]> =>
    (await other!.query<{ id: string }>('select id from items order by id')).rows.map((r) => r.id);

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('SUBMIT_SIGNER_DATABASE_URL missing');
    admin = new Pool({ connectionString: databaseUrl, max: 1 });
    admin.on('error', () => undefined);
    await admin.query(`drop database if exists ${DB_NAME} with (force)`);
    await admin.query(`create database ${DB_NAME}`);
    const url = new URL(databaseUrl);
    url.pathname = `/${DB_NAME}`;
    pool = new Pool({ connectionString: url.toString(), max: 4 });
    pool.on('error', () => undefined);
    other = new Pool({ connectionString: url.toString(), max: 1 });
    other.on('error', () => undefined);
    await other.query('create table items (id text primary key, note text not null)');
    root = new Kysely<Db>({ dialect: new PostgresDialect({ pool }) });
    db = withAmbientTransactions(root);
  });

  beforeEach(async () => {
    await other!.query('truncate items');
  });

  afterAll(async () => {
    await root?.destroy();
    await other?.end();
    if (admin) {
      await admin.query(`drop database if exists ${DB_NAME} with (force)`);
      await admin.end();
    }
  });

  const insert = (id: string) => db.insertInto('items').values({ id, note: 'n' }).execute();

  it('outside a scope every call is its own statement or transaction, as before', async () => {
    expect(isInAmbientTransaction()).toBe(false);
    await insert('a');
    await db
      .transaction()
      .execute(async (trx) => {
        await trx.insertInto('items').values({ id: 'b', note: 'n' }).execute();
        throw new Error('boom');
      })
      .catch(() => undefined);
    expect(await ids()).toEqual(['a']);
  });

  it('commits every query of the scope together', async () => {
    await runInAmbientTransaction(db, async () => {
      expect(isInAmbientTransaction()).toBe(true);
      await insert('a');
      await db
        .transaction()
        .execute((trx) => trx.insertInto('items').values({ id: 'b', note: 'n' }).execute());
      await sql`insert into items (id, note) values ('c', 'raw')`.execute(db);
      // Not visible to another connection before the commit.
      expect(await ids()).toEqual([]);
    });
    expect(await ids()).toEqual(['a', 'b', 'c']);
  });

  it('a failure after the writes and before the commit rolls every write back', async () => {
    await expect(
      runInAmbientTransaction(db, async () => {
        await insert('a');
        await db
          .transaction()
          .execute((trx) => trx.insertInto('items').values({ id: 'b', note: 'n' }).execute());
        throw new Error('crash before commit');
      }),
    ).rejects.toThrow('crash before commit');
    expect(await ids()).toEqual([]);
  });

  it('a caught failure inside a nested transaction rolls back only that savepoint', async () => {
    await runInAmbientTransaction(db, async () => {
      await insert('a');
      await db
        .transaction()
        .execute(async (trx) => {
          await trx.insertInto('items').values({ id: 'b', note: 'n' }).execute();
          // A duplicate key aborts the savepoint, not the outer transaction.
          await trx.insertInto('items').values({ id: 'a', note: 'dup' }).execute();
        })
        .catch(() => undefined);
      await insert('c');
    });
    expect(await ids()).toEqual(['a', 'c']);
  });

  it('runs after-commit work only after the outer commit, and drops it on rollback', async () => {
    const seen: string[][] = [];
    await runInAmbientTransaction(db, async () => {
      await insert('a');
      runAfterCommit(() => {
        void ids().then((r) => seen.push(r));
      });
      await db.transaction().execute(async () => {
        runAfterCommit(() => seen.push(['nested']));
      });
      expect(seen).toEqual([]);
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(seen).toEqual(expect.arrayContaining([['a'], ['nested']]));

    const dropped: string[] = [];
    await runInAmbientTransaction(db, async () => {
      await db
        .transaction()
        .execute(async () => {
          runAfterCommit(() => dropped.push('rolled-back savepoint'));
          throw new Error('inner');
        })
        .catch(() => undefined);
    });
    await runInAmbientTransaction(db, async () => {
      runAfterCommit(() => dropped.push('rolled-back transaction'));
      throw new Error('outer');
    }).catch(() => undefined);
    expect(dropped).toEqual([]);
    // Outside a scope it runs at once.
    runAfterCommit(() => dropped.push('now'));
    expect(dropped).toEqual(['now']);
  });

  it('work that outlives the scope falls back to the root connection', async () => {
    let late: Promise<unknown> = Promise.resolve();
    await runInAmbientTransaction(db, async () => {
      late = new Promise((r) => setTimeout(r, 20)).then(() => insert('late'));
    });
    await late;
    expect(await ids()).toEqual(['late']);
  });

  it('a nested scope is a savepoint of the outer one', async () => {
    await runInAmbientTransaction(db, async () => {
      await insert('a');
      await runInAmbientTransaction(db, async () => {
        await insert('b');
        throw new Error('inner');
      }).catch(() => undefined);
      await insert('c');
    });
    expect(await ids()).toEqual(['a', 'c']);
  });
});
