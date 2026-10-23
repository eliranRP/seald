import { ConflictException } from '@nestjs/common';
import { EnvelopesFixSignerOutputSchema } from 'shared';
import { findTokenShapedStrings } from '../../../leak-scan';
import {
  ENVELOPE_ID,
  OWNER,
  SIGNER_ID,
  call,
  dry,
  errorOf,
  laterWorld,
  ok,
  pending,
  principal,
  write,
} from './later-harness';

describe('envelopes_fix_signer', () => {
  it('returns approval_pending with approve_requires session and passes the verified credential', async () => {
    const w = laterWorld();
    w.answers.set('envelopeActions.fixSigner', pending());
    // Even a key whose owner turned approval off asks the owner.
    const p = principal(undefined, { requireOwnerApproval: false });
    const out = ok(
      await call(
        w,
        'envelopes_fix_signer',
        write({ envelope_id: ENVELOPE_ID, signer_id: SIGNER_ID, email: 'Ada@Example.com' }),
        p,
      ),
    );
    expect(EnvelopesFixSignerOutputSchema.safeParse(out).success).toBe(true);
    expect(out).toMatchObject({ status: 'approval_pending', approve_requires: 'session' });
    expect(findTokenShapedStrings(out)).toEqual([]);
    const [c] = w.calls;
    expect(c?.method).toBe('fixSigner');
    expect((c?.args[0] as { ownerId: string }).ownerId).toBe(OWNER);
    // The email is lower-cased by the input schema.
    expect(c?.args[1]).toMatchObject({
      envelope_id: ENVELOPE_ID,
      signer_id: SIGNER_ID,
      email: 'ada@example.com',
    });
    // One transaction for the claim, one savepoint around the write.
    expect(w.atomicRuns.count).toBe(2);
  });

  it('refuses an empty change and a stray confirmation_token', async () => {
    const w = laterWorld();
    expect(
      errorOf(
        await call(
          w,
          'envelopes_fix_signer',
          write({ envelope_id: ENVELOPE_ID, signer_id: SIGNER_ID }),
        ),
      ).slug,
    ).toBe('validation_error');
    expect(
      errorOf(
        await call(
          w,
          'envelopes_fix_signer',
          write({
            envelope_id: ENVELOPE_ID,
            signer_id: SIGNER_ID,
            name: 'Ada',
            confirmation_token: 'x'.repeat(43),
          }),
        ),
      ).slug,
    ).toBe('validation_error');
    expect(w.calls).toEqual([]);
  });

  it('a signer who already signed is signer_already_signed', async () => {
    const w = laterWorld();
    w.answers.set('envelopeActions.fixSigner', new ConflictException('signer_already_signed'));
    expect(
      errorOf(
        await call(
          w,
          'envelopes_fix_signer',
          write({ envelope_id: ENVELOPE_ID, signer_id: SIGNER_ID, name: 'Ada' }),
        ),
      ).slug,
    ).toBe('signer_already_signed');
  });

  it('dry_run runs the checks only', async () => {
    const w = laterWorld();
    w.answers.set('envelopeActions.checkFixSigner', { approve_requires: 'session' });
    const out = ok(
      await call(
        w,
        'envelopes_fix_signer',
        dry({ envelope_id: ENVELOPE_ID, signer_id: SIGNER_ID, name: 'Ada' }),
      ),
    );
    expect(out).toEqual({ dry_run: true, would: { approve_requires: 'session' } });
    expect(w.calls.map((c) => c.method)).toEqual(['checkFixSigner']);
  });

  it('needs envelopes:send', async () => {
    const w = laterWorld();
    expect(
      errorOf(
        await call(
          w,
          'envelopes_fix_signer',
          write({ envelope_id: ENVELOPE_ID, signer_id: SIGNER_ID, name: 'Ada' }),
          principal(['envelopes:read']),
        ),
      ).slug,
    ).toBe('insufficient_scope');
    expect(w.calls).toEqual([]);
  });
});
