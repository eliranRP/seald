import { EnvelopesSignAsSignerOutputSchema } from 'shared';
import {
  ENVELOPE_ID,
  OWNER,
  OWNER_EMAIL,
  SIGNER_ID,
  call,
  dryRun,
  errorOf,
  gatedWorld,
  ok,
  principal,
  write,
} from '../../account/__tests__/gated-harness';

const SIGNER = principal(['envelopes:sign']);
const OTHER_SIGNER = '66666666-6666-4666-8666-666666666666';

function envelopeWith(signers: Array<{ id: string; email: string }>) {
  return { id: ENVELOPE_ID, signers: signers.map((s) => ({ ...s, name: 'Signer' })) };
}

describe('envelopes_sign_as_signer (WP-45)', () => {
  it('asks the owner to sign as the signer with the account email, and signs nothing', async () => {
    const w = gatedWorld();
    w.answers.set(
      'envelopes.getById',
      envelopeWith([
        { id: OTHER_SIGNER, email: 'ada@example.com' },
        { id: SIGNER_ID, email: OWNER_EMAIL.toUpperCase() },
      ]),
    );
    const out = ok(
      await call(w, 'envelopes_sign_as_signer', write({ envelope_id: ENVELOPE_ID }), SIGNER),
    );
    expect(EnvelopesSignAsSignerOutputSchema.safeParse(out).success).toBe(true);
    expect(out).toMatchObject({ status: 'approval_pending', approve_requires: 'session' });
    expect(w.requests.map((r) => [r.kind, r.tool, r.args])).toEqual([
      [
        'envelope_sign_as_signer',
        'envelopes_sign_as_signer',
        { envelope_id: ENVELOPE_ID, signer_id: SIGNER_ID },
      ],
    ]);
    expect(w.calls.find((c) => c.method === 'getById')?.args).toEqual([OWNER, ENVELOPE_ID]);
    expect(w.actions()).toEqual([]);
  });

  it('passes an explicit signer_id to the approval kind, which refuses another signer', async () => {
    const w = gatedWorld();
    w.answers.set(
      'envelopes.getById',
      envelopeWith([{ id: OTHER_SIGNER, email: 'ada@example.com' }]),
    );
    ok(
      await call(
        w,
        'envelopes_sign_as_signer',
        write({ envelope_id: ENVELOPE_ID, signer_id: OTHER_SIGNER }),
        SIGNER,
      ),
    );
    expect(w.requests[0]?.args).toEqual({ envelope_id: ENVELOPE_ID, signer_id: OTHER_SIGNER });
  });

  it('an envelope without the owner as a signer is owner_not_a_signer', async () => {
    const w = gatedWorld();
    w.answers.set(
      'envelopes.getById',
      envelopeWith([{ id: OTHER_SIGNER, email: 'ada@example.com' }]),
    );
    expect(
      errorOf(
        await call(w, 'envelopes_sign_as_signer', write({ envelope_id: ENVELOPE_ID }), SIGNER),
      ).slug,
    ).toBe('owner_not_a_signer');
    expect(w.requests).toEqual([]);
  });

  it('two signer rows with the account email need signer_id', async () => {
    const w = gatedWorld();
    w.answers.set(
      'envelopes.getById',
      envelopeWith([
        { id: OTHER_SIGNER, email: OWNER_EMAIL },
        { id: SIGNER_ID, email: OWNER_EMAIL },
      ]),
    );
    expect(
      errorOf(
        await call(w, 'envelopes_sign_as_signer', write({ envelope_id: ENVELOPE_ID }), SIGNER),
      ).slug,
    ).toBe('signer_id_required');
  });

  it('dry_run opens nothing; envelopes:sign is required (envelopes:send is not enough)', async () => {
    const w = gatedWorld();
    w.answers.set('envelopes.getById', envelopeWith([{ id: SIGNER_ID, email: OWNER_EMAIL }]));
    ok(await call(w, 'envelopes_sign_as_signer', dryRun({ envelope_id: ENVELOPE_ID }), SIGNER));
    expect(w.requests).toEqual([]);
    expect(w.previews).toHaveLength(1);
    expect(
      errorOf(
        await call(
          w,
          'envelopes_sign_as_signer',
          write({ envelope_id: ENVELOPE_ID }),
          principal(['envelopes:read', 'envelopes:send']),
        ),
      ).slug,
    ).toBe('insufficient_scope');
  });
});
