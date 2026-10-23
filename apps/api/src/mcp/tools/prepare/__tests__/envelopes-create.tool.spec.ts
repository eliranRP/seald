import { McpEnvelopeSchema } from 'shared';
import {
  OWNER,
  callWrite,
  err,
  ok,
  resetFlags,
  setFlags,
  write,
  writeWorld,
} from '../../__tests__/write-harness';

describe('envelopes_create', () => {
  beforeEach(() => setFlags());
  afterEach(() => resetFlags());

  it('creates a draft owned by the key owner, document-aware', async () => {
    const w = writeWorld();
    const out = ok(await callWrite(w, 'envelopes_create', write({ title: 'NDA' })));
    expect(McpEnvelopeSchema.safeParse(out).success).toBe(true);
    expect(out).toMatchObject({ title: 'NDA', status: 'draft', signers: [], fields: [] });
    expect(Array.isArray(out['documents'])).toBe(true);
    const row = await w.envelopesRepo.findByIdForOwner(OWNER, out['id'] as string);
    expect(row?.owner_id).toBe(OWNER);
    // `created` went through appendEvent (the hash chain).
    const events = await w.envelopesRepo.listEventsForEnvelope(out['id'] as string);
    expect(events.map((e) => e.event_type)).toEqual(['created']);
  });

  it('dry run writes nothing and stores no idempotency row', async () => {
    const w = writeWorld();
    const out = ok(
      await callWrite(w, 'envelopes_create', {
        title: 'NDA',
        idempotency_key: 'k-00000001',
        dry_run: true,
      }),
    );
    expect(out).toEqual({ dry_run: true, would: { title: 'NDA', status: 'draft' } });
    expect((await w.envelopesRepo.listByOwner(OWNER, { limit: 10 })).items).toHaveLength(0);
    expect(w.idempotencyRepo.rows.size).toBe(0);
  });

  it('replays the same key and refuses the key for a different title', async () => {
    const w = writeWorld();
    const args = { title: 'NDA', idempotency_key: 'same-key-001', dry_run: false };
    const first = ok(await callWrite(w, 'envelopes_create', args));
    const again = ok(await callWrite(w, 'envelopes_create', args));
    expect(again['id']).toBe(first['id']);
    expect((await w.envelopesRepo.listByOwner(OWNER, { limit: 10 })).items).toHaveLength(1);
    const conflict = err(await callWrite(w, 'envelopes_create', { ...args, title: 'Other' }));
    expect(conflict.slug).toBe('idempotency_conflict');
    // Another key with the same client key does not replay the first key's row.
    const other = ok(await callWrite(w, 'envelopes_create', args, { keyId: 'key-2' }));
    expect(other['id']).not.toBe(first['id']);
  });

  it('requires idempotency_key and dry_run, and rejects unknown fields', async () => {
    const w = writeWorld();
    expect(err(await callWrite(w, 'envelopes_create', { title: 'NDA' })).slug).toBe(
      'validation_error',
    );
    expect(
      err(
        await callWrite(w, 'envelopes_create', {
          title: 'NDA',
          idempotency_key: 'short',
          dry_run: false,
        }),
      ).slug,
    ).toBe('validation_error');
    expect(
      err(await callWrite(w, 'envelopes_create', write({ title: 'NDA', owner_id: OWNER }))).slug,
    ).toBe('validation_error');
  });

  it('is insufficient_scope with a read-only key', async () => {
    const w = writeWorld();
    const out = err(
      await callWrite(w, 'envelopes_create', write({ title: 'NDA' }), {
        scopes: ['envelopes:read'],
      }),
    );
    expect(out.slug).toBe('insufficient_scope');
  });
});
