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

  it('loads 0003 migration and allows inserting an outbound_email + idempotency + webhook', async () => {
    const { createPgMemDb, seedUser } = await import('./pg-mem-db');
    const handle = createPgMemDb();
    try {
      const ownerId = await seedUser(handle);
      const env = await handle.db
        .insertInto('envelopes')
        .values({
          owner_id: ownerId,
          title: 'E',
          short_code: 'outbound12345',
          tc_version: 'v1',
          privacy_version: 'v1',
          expires_at: '2026-05-24T00:00:00.000Z',
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      await handle.db
        .insertInto('outbound_emails')
        .values({
          envelope_id: env.id,
          kind: 'invite',
          to_email: 'a@b.com',
          to_name: 'Ada',
          payload: JSON.stringify({ subject: 'hi' }),
        })
        .execute();

      await handle.db
        .insertInto('idempotency_records')
        .values({
          user_id: ownerId,
          idempotency_key: 'abc-123',
          method: 'POST',
          path: '/envelopes',
          request_hash: 'h',
          response_status: 201,
          response_body: JSON.stringify({ id: env.id }),
        })
        .execute();

      await handle.db
        .insertInto('email_webhooks')
        .values({
          provider: 'resend',
          event_type: 'email.delivered',
          provider_id: 'resend-msg-1',
          payload: JSON.stringify({ foo: 'bar' }),
        })
        .execute();

      const [emails, idem, hooks] = await Promise.all([
        handle.db.selectFrom('outbound_emails').selectAll().execute(),
        handle.db.selectFrom('idempotency_records').selectAll().execute(),
        handle.db.selectFrom('email_webhooks').selectAll().execute(),
      ]);
      expect([emails.length, idem.length, hooks.length]).toEqual([1, 1, 1]);
      expect(emails[0]?.status).toBe('pending');
      expect(idem[0]?.response_status).toBe(201);
    } finally {
      await handle.close();
    }
  });

  it('enforces outbound_emails unique (envelope_id, signer_id, kind, source_event_id)', async () => {
    const { createPgMemDb, seedUser } = await import('./pg-mem-db');
    const handle = createPgMemDb();
    try {
      const ownerId = await seedUser(handle);
      const env = await handle.db
        .insertInto('envelopes')
        .values({
          owner_id: ownerId,
          title: 'E',
          short_code: 'uniqtest98765',
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

      const ev = await handle.db
        .insertInto('envelope_events')
        .values({
          envelope_id: env.id,
          signer_id: signer.id,
          actor_kind: 'sender',
          event_type: 'sent',
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      await handle.db
        .insertInto('outbound_emails')
        .values({
          envelope_id: env.id,
          signer_id: signer.id,
          kind: 'invite',
          to_email: 'a@b.com',
          to_name: 'Ada',
          payload: JSON.stringify({}),
          source_event_id: ev.id,
        })
        .execute();

      // Duplicate with the same 4-tuple should violate the unique constraint.
      await expect(
        handle.db
          .insertInto('outbound_emails')
          .values({
            envelope_id: env.id,
            signer_id: signer.id,
            kind: 'invite',
            to_email: 'a@b.com',
            to_name: 'Ada',
            payload: JSON.stringify({}),
            source_event_id: ev.id,
          })
          .execute(),
      ).rejects.toThrow();
    } finally {
      await handle.close();
    }
  });
});
