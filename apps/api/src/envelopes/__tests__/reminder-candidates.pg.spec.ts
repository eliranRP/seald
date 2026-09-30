import { createPgMemDb, seedUser, type PgMemHandle } from '../../../test/pg-mem-db';
import { EnvelopesPgRepository } from '../envelopes.repository.pg';
import type { CreateDraftInput } from '../envelopes.repository';

const HOUR = 60 * 60 * 1000;

function draftInput(owner_id: string): CreateDraftInput {
  return {
    owner_id,
    title: 'Reminder envelope',
    short_code: 'SC00000000099',
    tc_version: 'tc-v1',
    privacy_version: 'pp-v1',
    expires_at: new Date(Date.now() + 14 * 24 * HOUR).toISOString(),
  };
}

describe('EnvelopesPgRepository — reminder candidates', () => {
  let handle: PgMemHandle;
  let repo: EnvelopesPgRepository;
  let ownerId: string;

  beforeEach(async () => {
    handle = createPgMemDb();
    repo = new EnvelopesPgRepository(handle.db);
    ownerId = await seedUser(handle);
  });
  afterEach(async () => {
    await handle.close();
  });

  async function sendOne(): Promise<{ envelopeId: string; signerId: string }> {
    const draft = await repo.createDraft(draftInput(ownerId));
    expect(draft.reminders_enabled).toBe(true);
    const signer = await repo.addSigner(draft.id, {
      email: 'ada@example.com',
      name: 'Ada',
      color: '#112233',
    });
    await repo.sendDraft({
      envelope_id: draft.id,
      signer_tokens: [{ signer_id: signer.id, access_token_hash: 'a'.repeat(64) }],
      sender_email: 'sender@example.com',
      sender_name: 'Sender',
    });
    return { envelopeId: draft.id, signerId: signer.id };
  }

  it('lists a signer 24h after invite, claims once, and skips a signed signer', async () => {
    const { envelopeId, signerId } = await sendOne();
    const invited = new Date(Date.now() - 25 * HOUR).toISOString();
    await handle.db
      .updateTable('envelope_signers')
      .set({ access_token_sent_at: invited })
      .where('id', '=', signerId)
      .execute();

    const now = new Date();
    const due = await repo.listReminderCandidates(now, 10);
    expect(due.map((row) => row.signerId)).toEqual([signerId]);

    expect(await repo.tryClaimReminder(signerId, now)).toBe(true);
    expect(await repo.tryClaimReminder(signerId, now)).toBe(false);
    expect(await repo.listReminderCandidates(now, 10)).toEqual([]);

    await handle.db
      .updateTable('envelope_signers')
      .set({
        last_reminded_at: null,
        signed_at: now.toISOString(),
        tc_accepted_at: now.toISOString(),
        signature_format: 'typed',
      })
      .where('id', '=', signerId)
      .execute();
    expect(await repo.listReminderCandidates(now, 10)).toEqual([]);
    expect(await repo.tryClaimReminder(signerId, now)).toBe(false);

    await handle.db
      .updateTable('envelope_signers')
      .set({ signed_at: null })
      .where('id', '=', signerId)
      .execute();
    await handle.db
      .updateTable('envelopes')
      .set({ status: 'completed' })
      .where('id', '=', envelopeId)
      .execute();
    expect(await repo.listReminderCandidates(now, 10)).toEqual([]);
  });

  it('refuses the claim when the envelope is canceled', async () => {
    const { envelopeId, signerId } = await sendOne();
    await handle.db
      .updateTable('envelope_signers')
      .set({
        access_token_sent_at: new Date(Date.now() - 25 * HOUR).toISOString(),
        last_reminded_at: null,
      })
      .where('id', '=', signerId)
      .execute();
    await handle.db
      .updateTable('envelopes')
      .set({ status: 'canceled' })
      .where('id', '=', envelopeId)
      .execute();

    expect(await repo.tryClaimReminder(signerId, new Date())).toBe(false);

    const signer = await handle.db
      .selectFrom('envelope_signers')
      .select(['last_reminded_at'])
      .where('id', '=', signerId)
      .executeTakeFirst();
    expect(signer?.last_reminded_at ?? null).toBeNull();
  });

  it('omits an envelope whose reminders are disabled', async () => {
    const { envelopeId, signerId } = await sendOne();
    await handle.db
      .updateTable('envelope_signers')
      .set({ access_token_sent_at: new Date(Date.now() - 25 * HOUR).toISOString() })
      .where('id', '=', signerId)
      .execute();
    const disabled = await repo.updateDraftMetadata(ownerId, envelopeId, {
      reminders_enabled: false,
    });
    expect(disabled?.reminders_enabled).toBe(false);
    expect(await repo.listReminderCandidates(new Date(), 10)).toEqual([]);
  });
});
