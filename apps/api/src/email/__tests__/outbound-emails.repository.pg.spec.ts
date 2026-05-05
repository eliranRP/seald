import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { createPgMemDb, seedUser, type PgMemHandle } from '../../../test/pg-mem-db';
import { DuplicateOutboundEmailError } from '../outbound-emails.repository';
import { OutboundEmailsPgRepository } from '../outbound-emails.repository.pg';

async function seedEnvelopeAndSigner(handle: PgMemHandle, owner_id: string) {
  const env = await handle.db
    .insertInto('envelopes')
    .values({
      owner_id,
      title: 'Test',
      short_code: randomUUID().slice(0, 13),
      tc_version: 'v1',
      privacy_version: 'v1',
      expires_at: '2026-06-01T00:00:00.000Z',
    })
    .returning(['id'])
    .executeTakeFirstOrThrow();
  const signer = await handle.db
    .insertInto('envelope_signers')
    .values({
      envelope_id: env.id,
      email: 'ada@example.com',
      name: 'Ada',
      color: '#112233',
    })
    .returning(['id'])
    .executeTakeFirstOrThrow();
  const event = await handle.db
    .insertInto('envelope_events')
    .values({
      envelope_id: env.id,
      signer_id: signer.id,
      actor_kind: 'system',
      event_type: 'sent',
    })
    .returning(['id'])
    .executeTakeFirstOrThrow();
  return { envelopeId: env.id, signerId: signer.id, eventId: event.id };
}

describe('OutboundEmailsPgRepository', () => {
  let handle: PgMemHandle;
  let repo: OutboundEmailsPgRepository;
  let ownerId: string;
  beforeEach(async () => {
    handle = createPgMemDb();
    ownerId = await seedUser(handle);
    repo = new OutboundEmailsPgRepository(handle.db);
  });
  afterEach(async () => {
    await handle.close();
  });

  describe('insert', () => {
    it('persists a row with sensible defaults', async () => {
      const { envelopeId, signerId, eventId } = await seedEnvelopeAndSigner(handle, ownerId);
      const row = await repo.insert({
        envelope_id: envelopeId,
        signer_id: signerId,
        kind: 'invite',
        to_email: 'ada@example.com',
        to_name: 'Ada',
        payload: { sign_url: 'https://x/sign?t=abc' },
        source_event_id: eventId,
      });
      expect(row.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(row.kind).toBe('invite');
      expect(row.status).toBe('pending');
      expect(row.attempts).toBe(0);
      expect(row.max_attempts).toBe(8);
      expect(row.payload).toEqual({ sign_url: 'https://x/sign?t=abc' });
      expect(row.sent_at).toBeNull();
    });

    it('allows independent rows for the same signer when source_event_id differs', async () => {
      const { envelopeId, signerId } = await seedEnvelopeAndSigner(handle, ownerId);
      const evA = await handle.db
        .insertInto('envelope_events')
        .values({
          envelope_id: envelopeId,
          signer_id: signerId,
          actor_kind: 'system',
          event_type: 'sent',
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();
      const evB = await handle.db
        .insertInto('envelope_events')
        .values({
          envelope_id: envelopeId,
          signer_id: signerId,
          actor_kind: 'sender',
          event_type: 'reminder_sent',
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();
      await repo.insert({
        envelope_id: envelopeId,
        signer_id: signerId,
        kind: 'invite',
        to_email: 'ada@example.com',
        to_name: 'Ada',
        payload: {},
        source_event_id: evA.id,
      });
      const second = await repo.insert({
        envelope_id: envelopeId,
        signer_id: signerId,
        kind: 'reminder',
        to_email: 'ada@example.com',
        to_name: 'Ada',
        payload: {},
        source_event_id: evB.id,
      });
      expect(second.kind).toBe('reminder');
    });

    it('raises DuplicateOutboundEmailError on (envelope, signer, kind, source_event_id) duplicate', async () => {
      const { envelopeId, signerId, eventId } = await seedEnvelopeAndSigner(handle, ownerId);
      await repo.insert({
        envelope_id: envelopeId,
        signer_id: signerId,
        kind: 'invite',
        to_email: 'ada@example.com',
        to_name: 'Ada',
        payload: {},
        source_event_id: eventId,
      });
      await expect(
        repo.insert({
          envelope_id: envelopeId,
          signer_id: signerId,
          kind: 'invite',
          to_email: 'ada@example.com',
          to_name: 'Ada',
          payload: {},
          source_event_id: eventId,
        }),
      ).rejects.toBeInstanceOf(DuplicateOutboundEmailError);
    });
  });

  describe('insertMany', () => {
    it('inserts all rows atomically', async () => {
      const { envelopeId, signerId } = await seedEnvelopeAndSigner(handle, ownerId);
      const ev1 = await handle.db
        .insertInto('envelope_events')
        .values({
          envelope_id: envelopeId,
          signer_id: signerId,
          actor_kind: 'system',
          event_type: 'sent',
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();
      const ev2 = await handle.db
        .insertInto('envelope_events')
        .values({ envelope_id: envelopeId, actor_kind: 'system', event_type: 'sent' })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      const rows = await repo.insertMany([
        {
          envelope_id: envelopeId,
          signer_id: signerId,
          kind: 'invite',
          to_email: 'a@x.com',
          to_name: 'A',
          payload: {},
          source_event_id: ev1.id,
        },
        {
          envelope_id: envelopeId,
          kind: 'completed',
          to_email: 'sender@x.com',
          to_name: 'Sender',
          payload: {},
          source_event_id: ev2.id,
        },
      ]);
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.kind).sort()).toEqual(['completed', 'invite']);
    });

    it('empty array is a no-op', async () => {
      const out = await repo.insertMany([]);
      expect(out).toEqual([]);
    });
  });

  describe('listByEnvelope', () => {
    it('returns rows in created_at asc order', async () => {
      const { envelopeId, signerId } = await seedEnvelopeAndSigner(handle, ownerId);
      const evA = await handle.db
        .insertInto('envelope_events')
        .values({
          envelope_id: envelopeId,
          signer_id: signerId,
          actor_kind: 'system',
          event_type: 'sent',
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();
      const evB = await handle.db
        .insertInto('envelope_events')
        .values({
          envelope_id: envelopeId,
          signer_id: signerId,
          actor_kind: 'sender',
          event_type: 'reminder_sent',
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();
      await repo.insert({
        envelope_id: envelopeId,
        signer_id: signerId,
        kind: 'invite',
        to_email: 'ada@example.com',
        to_name: 'Ada',
        payload: {},
        source_event_id: evA.id,
      });
      await repo.insert({
        envelope_id: envelopeId,
        signer_id: signerId,
        kind: 'reminder',
        to_email: 'ada@example.com',
        to_name: 'Ada',
        payload: {},
        source_event_id: evB.id,
      });
      const list = await repo.listByEnvelope(envelopeId);
      expect(list).toHaveLength(2);
      expect(list[0]!.kind).toBe('invite');
      expect(list[1]!.kind).toBe('reminder');
    });
  });

  describe('findLastInviteOrReminder', () => {
    it('returns null when no prior row exists', async () => {
      const { envelopeId, signerId } = await seedEnvelopeAndSigner(handle, ownerId);
      const out = await repo.findLastInviteOrReminder(envelopeId, signerId);
      expect(out).toBeNull();
    });

    it('returns the most recent row and ignores non-invite/reminder kinds', async () => {
      const { envelopeId, signerId } = await seedEnvelopeAndSigner(handle, ownerId);
      const evA = await handle.db
        .insertInto('envelope_events')
        .values({
          envelope_id: envelopeId,
          signer_id: signerId,
          actor_kind: 'system',
          event_type: 'sent',
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();
      const evB = await handle.db
        .insertInto('envelope_events')
        .values({
          envelope_id: envelopeId,
          signer_id: signerId,
          actor_kind: 'sender',
          event_type: 'reminder_sent',
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();
      const invite = await repo.insert({
        envelope_id: envelopeId,
        signer_id: signerId,
        kind: 'invite',
        to_email: 'ada@example.com',
        to_name: 'Ada',
        payload: {},
        source_event_id: evA.id,
      });
      const reminder = await repo.insert({
        envelope_id: envelopeId,
        signer_id: signerId,
        kind: 'reminder',
        to_email: 'ada@example.com',
        to_name: 'Ada',
        payload: {},
        source_event_id: evB.id,
      });
      // Rule 9.6 — explicit per-row created_at overrides remove the
      // race-based ordering that `setTimeout(10)` previously relied on.
      // The repository orders by created_at desc, so set the older row
      // earlier and the newer one later with a deterministic gap.
      // Bypass kysely's `never`-typed update for created_at via raw SQL.
      // The schema deliberately marks created_at as non-updatable through
      // the typed query builder (ColumnType<Date, string|undefined, never>),
      // but tests need to deterministically order rows. sql.raw is fine
      // here because there is no user-controlled input.
      await sql`update outbound_emails set created_at = '2026-04-25T00:00:00.000Z' where id = ${invite.id}`.execute(
        handle.db,
      );
      await sql`update outbound_emails set created_at = '2026-04-25T00:00:01.000Z' where id = ${reminder.id}`.execute(
        handle.db,
      );
      const last = await repo.findLastInviteOrReminder(envelopeId, signerId);
      expect(last?.id).toBe(reminder.id);
    });
  });
});
