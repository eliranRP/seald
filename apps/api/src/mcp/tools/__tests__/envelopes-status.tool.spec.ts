import { EnvelopesStatusOutputSchema } from 'shared';
import { findTokenShapedStrings } from '../../leak-scan';
import {
  DOC_1,
  ENVELOPE_ID,
  OTHER_ENVELOPE_ID,
  OTHER_OWNER,
  READ_METHODS,
  SIGNER_A,
  SIGNER_B,
  call,
  envelopeFixture,
  errorOf,
  okOf,
  world,
} from './harness';

describe('envelopes_status', () => {
  it('reports per-signer state, pending signers, documents and remind when allowed', async () => {
    const w = world();
    const out = okOf(await call(w, 'envelopes_status', { envelope_id: ENVELOPE_ID }));
    expect(EnvelopesStatusOutputSchema.safeParse(out).success).toBe(true);
    expect(out).toMatchObject({
      envelope_id: ENVELOPE_ID,
      status: 'awaiting_others',
      signers: [
        { id: SIGNER_A, status: 'signed' },
        { id: SIGNER_B, status: 'sent', sent_at: '2026-10-01T10:00:00.000Z' },
      ],
      pending_signers: [{ id: SIGNER_B, name: 'Bob', email: 'bob@example.com' }],
      next_action: 'remind',
      can_remind_at: null,
      documents: [{ id: DOC_1 }],
    });
    expect(findTokenShapedStrings(out)).toEqual([]);
  });

  it('says wait, with can_remind_at, inside the one-hour window', async () => {
    const w = world();
    w.remindWindows.set(SIGNER_B, '2026-10-02T12:30:00.000Z');
    const out = okOf(await call(w, 'envelopes_status', { envelope_id: ENVELOPE_ID }));
    expect(out).toMatchObject({ next_action: 'wait', can_remind_at: '2026-10-02T12:30:00.000Z' });
  });

  it('says viewed for a signer who opened the link', async () => {
    const w = world();
    const env = envelopeFixture();
    const signers = env.signers.map((s) =>
      s.id === SIGNER_B ? { ...s, viewed_at: '2026-10-01T12:00:00.000Z' } : s,
    );
    w.envelopes = [{ ...env, signers }];
    const out = okOf(await call(w, 'envelopes_status', { envelope_id: ENVELOPE_ID }));
    expect((out['signers'] as Array<{ status: string }>)[1]?.status).toBe('viewed');
  });

  it('says download when completed and none for a draft (signers not_sent)', async () => {
    const w = world();
    w.envelopes = [
      envelopeFixture({ status: 'completed', completed_at: '2026-10-02T00:00:00.000Z' }),
    ];
    expect(okOf(await call(w, 'envelopes_status', { envelope_id: ENVELOPE_ID }))).toMatchObject({
      next_action: 'download',
      can_remind_at: null,
    });

    w.envelopes = [
      envelopeFixture({
        status: 'draft',
        sent_at: null,
        signers: envelopeFixture().signers.map((s) => ({
          ...s,
          viewed_at: null,
          signed_at: null,
        })),
      }),
    ];
    const draft = okOf(await call(w, 'envelopes_status', { envelope_id: ENVELOPE_ID }));
    expect(draft['next_action']).toBe('none');
    expect((draft['signers'] as Array<{ status: string }>).map((s) => s.status)).toEqual([
      'not_sent',
      'not_sent',
    ]);
  });

  it('says declined for a signer who declined', async () => {
    const w = world();
    const env = envelopeFixture({ status: 'declined' });
    w.envelopes = [
      {
        ...env,
        signers: env.signers.map((s) =>
          s.id === SIGNER_B ? { ...s, declined_at: '2026-10-01T12:00:00.000Z' } : s,
        ),
      },
    ];
    const out = okOf(await call(w, 'envelopes_status', { envelope_id: ENVELOPE_ID }));
    expect((out['signers'] as Array<{ status: string }>)[1]?.status).toBe('declined');
    expect(out['next_action']).toBe('none');
  });

  it('rejects a missing required field and an unknown field', async () => {
    const w = world();
    expect(errorOf(await call(w, 'envelopes_status', {})).slug).toBe('validation_error');
    expect(
      errorOf(await call(w, 'envelopes_status', { envelope_id: ENVELOPE_ID, verbose: true })).slug,
    ).toBe('validation_error');
  });

  it('is insufficient_scope without envelopes:read', async () => {
    const w = world();
    const err = errorOf(await call(w, 'envelopes_status', { envelope_id: ENVELOPE_ID }, []));
    expect(err.slug).toBe('insufficient_scope');
  });

  it("answers another owner's envelope as not found", async () => {
    const w = world();
    w.envelopes.push(envelopeFixture({ id: OTHER_ENVELOPE_ID, owner_id: OTHER_OWNER }));
    const err = errorOf(await call(w, 'envelopes_status', { envelope_id: OTHER_ENVELOPE_ID }));
    expect(err.slug).toBe('envelope_not_found');
  });

  it('only calls read methods', async () => {
    const w = world();
    await call(w, 'envelopes_status', { envelope_id: ENVELOPE_ID });
    for (const c of w.calls) expect(READ_METHODS).toContain(c);
  });
});
