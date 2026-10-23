import { ConflictException } from '@nestjs/common';
import { EnvelopesCancelOutputSchema } from 'shared';
import { findTokenShapedStrings } from '../../../leak-scan';
import {
  ENVELOPE_ID,
  OWNER,
  call,
  errorOf,
  ok,
  pending,
  principal,
  sendWorld,
  write,
} from '../../send/__tests__/send-harness';

const cancelPending = () =>
  pending({
    approve_requires: 'session',
    summary: { ...pending().summary, kind: 'envelope_cancel', action_label: 'Cancel the request' },
  });

describe('envelopes_cancel', () => {
  it('always returns approval_pending with approve_requires session', async () => {
    const w = sendWorld();
    w.answers.set('cancel', cancelPending());
    const p = principal(undefined, { requireOwnerApproval: false });
    const out = ok(await call(w, 'envelopes_cancel', write({ envelope_id: ENVELOPE_ID }), p));
    expect(EnvelopesCancelOutputSchema.safeParse(out).success).toBe(true);
    expect(out).toMatchObject({ status: 'approval_pending', approve_requires: 'session' });
    expect(findTokenShapedStrings(out)).toEqual([]);
    const [c] = w.calls;
    expect(c?.method).toBe('cancel');
    expect(c?.cred.ownerId).toBe(OWNER);
    expect(c?.args[0]).toBe(ENVELOPE_ID);
    // One transaction for the claim, one savepoint around the write.
    expect(w.atomicRuns.count).toBe(2);
  });

  it('a terminal envelope is envelope_terminal', async () => {
    const w = sendWorld();
    w.answers.set('cancel', new ConflictException('envelope_terminal'));
    expect(
      errorOf(await call(w, 'envelopes_cancel', write({ envelope_id: ENVELOPE_ID }))).slug,
    ).toBe('envelope_terminal');
  });

  it('dry_run checks the envelope only', async () => {
    const w = sendWorld();
    w.answers.set('checkCancel', { envelope_id: ENVELOPE_ID, approve_requires: 'session' });
    const out = ok(
      await call(w, 'envelopes_cancel', {
        idempotency_key: 'dry-run-0004',
        dry_run: true,
        envelope_id: ENVELOPE_ID,
      }),
    );
    expect(out).toEqual({
      dry_run: true,
      would: { envelope_id: ENVELOPE_ID, approve_requires: 'session' },
    });
    expect(w.calls.map((c) => c.method)).toEqual(['checkCancel']);
  });

  it('takes no confirmation_token and needs envelopes:send', async () => {
    const w = sendWorld();
    expect(
      errorOf(
        await call(
          w,
          'envelopes_cancel',
          write({ envelope_id: ENVELOPE_ID, confirmation_token: 'x'.repeat(43) }),
        ),
      ).slug,
    ).toBe('validation_error');
    expect(
      errorOf(
        await call(
          w,
          'envelopes_cancel',
          write({ envelope_id: ENVELOPE_ID }),
          principal(['envelopes:read']),
        ),
      ).slug,
    ).toBe('insufficient_scope');
    expect(w.calls).toEqual([]);
  });
});
