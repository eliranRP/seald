import { createPgMemDb, seedUser } from './pg-mem-db';

describe('pg-mem-db helper', () => {
  it('applies the migration and supports insert + select on contacts', async () => {
    const handle = createPgMemDb();
    try {
      const ownerId = await seedUser(handle);

      const inserted = await handle.db
        .insertInto('contacts')
        .values({
          owner_id: ownerId,
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          color: '#FF00FF',
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      expect(inserted.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(inserted.owner_id).toBe(ownerId);

      const rows = await handle.db
        .selectFrom('contacts')
        .selectAll()
        .where('owner_id', '=', ownerId)
        .execute();

      expect(rows).toHaveLength(1);
      expect(rows[0]?.email).toBe('ada@example.com');
    } finally {
      await handle.close();
    }
  });
});

describe('pg-mem bootstrap — phase 3 envelopes', () => {
  it('loads 0002 migration and allows inserting an envelope', async () => {
    const { createPgMemDb, seedUser } = await import('./pg-mem-db');
    const handle = createPgMemDb();
    try {
      const ownerId = await seedUser(handle);
      await handle.db
        .insertInto('envelopes')
        .values({
          owner_id: ownerId,
          title: 'Test NDA',
          short_code: 'abcdefghijk12',
          tc_version: '2026-04-24',
          privacy_version: '2026-04-24',
          expires_at: '2026-05-24T00:00:00.000Z',
        })
        .execute();

      const rows = await handle.db.selectFrom('envelopes').selectAll().execute();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.status).toBe('draft');
      expect(rows[0]?.delivery_mode).toBe('parallel');
    } finally {
      await handle.close();
    }
  });

  it('allows inserting a signer, field, event, and job row', async () => {
    const { createPgMemDb, seedUser } = await import('./pg-mem-db');
    const handle = createPgMemDb();
    try {
      const ownerId = await seedUser(handle);
      const env = await handle.db
        .insertInto('envelopes')
        .values({
          owner_id: ownerId,
          title: 'T',
          short_code: '0123456789abc',
          tc_version: 'v1',
          privacy_version: 'v1',
          expires_at: '2026-05-24T00:00:00.000Z',
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      const signer = await handle.db
        .insertInto('envelope_signers')
        .values({
          envelope_id: env.id,
          email: 'a@b.com',
          name: 'Ada',
          color: '#112233',
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      await handle.db
        .insertInto('envelope_fields')
        .values({
          envelope_id: env.id,
          signer_id: signer.id,
          kind: 'signature',
          page: 1,
          x: 0.5,
          y: 0.5,
        })
        .execute();

      await handle.db
        .insertInto('envelope_events')
        .values({
          envelope_id: env.id,
          signer_id: signer.id,
          actor_kind: 'sender',
          event_type: 'created',
        })
        .execute();

      await handle.db
        .insertInto('envelope_jobs')
        .values({ envelope_id: env.id, kind: 'seal' })
        .execute();

      const counts = await Promise.all([
        handle.db.selectFrom('envelope_signers').selectAll().execute(),
        handle.db.selectFrom('envelope_fields').selectAll().execute(),
        handle.db.selectFrom('envelope_events').selectAll().execute(),
        handle.db.selectFrom('envelope_jobs').selectAll().execute(),
      ]);
      expect(counts.map((c) => c.length)).toEqual([1, 1, 1, 1]);
    } finally {
      await handle.close();
    }
  });
});
