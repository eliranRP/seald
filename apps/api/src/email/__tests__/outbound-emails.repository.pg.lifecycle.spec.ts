import { randomUUID } from 'node:crypto';
import { createPgMemDb, seedUser, type PgMemHandle } from '../../../test/pg-mem-db';
import { OutboundEmailsPgRepository } from '../outbound-emails.repository.pg';

/**
 * Lifecycle coverage for the PG outbound-emails adapter — dispatcher
 * post-claim path. The original spec covers `insert` / `insertMany` /
 * `listByEnvelope` / `findLastInviteOrReminder`. This file fills the
 * `markSent` / `markFailed` branches that the dispatcher uses after
 * `claimNext`:
 *
 *   - markSent flips status to `sent`, sets provider_id + sent_at,
 *     clears last_error
 *   - markFailed(final=true) flips to `failed` and stores the error
 *   - markFailed(final=false) flips back to `pending` with optional
 *     scheduled_for reschedule
 *   - markFailed truncates very long error messages (text column has no
 *     limit but we cap at 500 to avoid log bloat)
 *
 * `claimNext` itself is exercised end-to-end via the
 * `InMemoryOutboundEmailsRepository` in `email-dispatcher.service.spec.ts`
 * — its raw SQL uses `for update skip locked`, which pg-mem cannot
 * parse, so it can't run here. Real-Postgres coverage for that path
 * lives behind the e2e suite.
 */

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
  return { envelopeId: env.id, signerId: signer.id };
}

describe('OutboundEmailsPgRepository — dispatcher lifecycle', () => {
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

  describe('markSent', () => {
    it('flips status → sent, populates provider_id + sent_at, clears last_error', async () => {
      const { envelopeId, signerId } = await seedEnvelopeAndSigner(handle, ownerId);
      const row = await repo.insert({
        envelope_id: envelopeId,
        signer_id: signerId,
        kind: 'invite',
        to_email: 'ada@example.com',
        to_name: 'Ada',
        payload: {},
      });
      await repo.markSent(row.id, 'prv_resend_42', new Date('2026-04-29T10:00:00Z'));
      const reread = await handle.db
        .selectFrom('outbound_emails')
        .selectAll()
        .where('id', '=', row.id)
        .executeTakeFirstOrThrow();
      expect(reread.status).toBe('sent');
      expect(reread.provider_id).toBe('prv_resend_42');
      expect(reread.last_error).toBeNull();
      expect(reread.sent_at).toBeTruthy();
    });
  });

  describe('markFailed', () => {
    it('final=true flips to failed and stores last_error', async () => {
      const { envelopeId, signerId } = await seedEnvelopeAndSigner(handle, ownerId);
      const row = await repo.insert({
        envelope_id: envelopeId,
        signer_id: signerId,
        kind: 'invite',
        to_email: 'ada@example.com',
        to_name: 'Ada',
        payload: {},
      });
      await repo.markFailed(row.id, { error: 'bad_address', final: true });
      const reread = await handle.db
        .selectFrom('outbound_emails')
        .selectAll()
        .where('id', '=', row.id)
        .executeTakeFirstOrThrow();
      expect(reread.status).toBe('failed');
      expect(reread.last_error).toBe('bad_address');
    });

    it('final=false flips back to pending and reschedules to nextAttemptAt', async () => {
      const { envelopeId, signerId } = await seedEnvelopeAndSigner(handle, ownerId);
      const row = await repo.insert({
        envelope_id: envelopeId,
        signer_id: signerId,
        kind: 'invite',
        to_email: 'ada@example.com',
        to_name: 'Ada',
        payload: {},
      });
      const next = new Date('2026-05-01T00:00:00Z');
      await repo.markFailed(row.id, {
        error: 'transient_blip',
        final: false,
        nextAttemptAt: next,
      });
      const reread = await handle.db
        .selectFrom('outbound_emails')
        .selectAll()
        .where('id', '=', row.id)
        .executeTakeFirstOrThrow();
      expect(reread.status).toBe('pending');
      expect(reread.last_error).toBe('transient_blip');
      const scheduled = new Date(reread.scheduled_for as unknown as string).toISOString();
      expect(scheduled).toBe('2026-05-01T00:00:00.000Z');
    });

    it('final=false without nextAttemptAt leaves scheduled_for untouched', async () => {
      // The repo conditionally spreads `scheduled_for` only when the
      // caller passed it — branch coverage for the `...(args.nextAttemptAt
      // ? { scheduled_for } : {})` line.
      const { envelopeId, signerId } = await seedEnvelopeAndSigner(handle, ownerId);
      const row = await repo.insert({
        envelope_id: envelopeId,
        signer_id: signerId,
        kind: 'invite',
        to_email: 'ada@example.com',
        to_name: 'Ada',
        payload: {},
      });
      const before = row.scheduled_for;
      await repo.markFailed(row.id, { error: 'flap', final: false });
      const reread = await handle.db
        .selectFrom('outbound_emails')
        .selectAll()
        .where('id', '=', row.id)
        .executeTakeFirstOrThrow();
      const scheduled = new Date(reread.scheduled_for as unknown as string).toISOString();
      expect(scheduled).toBe(new Date(before).toISOString());
    });

    it('truncates last_error past 500 chars to keep the audit log compact', async () => {
      const { envelopeId, signerId } = await seedEnvelopeAndSigner(handle, ownerId);
      const row = await repo.insert({
        envelope_id: envelopeId,
        signer_id: signerId,
        kind: 'invite',
        to_email: 'ada@example.com',
        to_name: 'Ada',
        payload: {},
      });
      const longError = 'x'.repeat(900);
      await repo.markFailed(row.id, { error: longError, final: true });
      const reread = await handle.db
        .selectFrom('outbound_emails')
        .selectAll()
        .where('id', '=', row.id)
        .executeTakeFirstOrThrow();
      // Cap is 497 chars + "…" (1 char total in JS). Total length = 498.
      expect(reread.last_error?.length).toBeLessThanOrEqual(500);
      expect(reread.last_error?.endsWith('…')).toBe(true);
    });
  });
});
