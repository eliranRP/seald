import { ConflictException, HttpException, HttpStatus } from '@nestjs/common';
import { EnvelopesRemindOutputSchema } from 'shared';
import { findTokenShapedStrings } from '../../../leak-scan';
import {
  ENVELOPE_ID,
  OWNER,
  SIGNER_ID,
  call,
  errorOf,
  ok,
  pending,
  principal,
  sendWorld,
  write,
} from '../../send/__tests__/send-harness';

const remindPending = () =>
  pending({
    approve_requires: 'link',
    summary: { ...pending().summary, kind: 'envelope_remind', action_label: 'Send a reminder' },
  });

describe('envelopes_remind', () => {
  it('always returns approval_pending, even for an unattended key', async () => {
    const w = sendWorld();
    w.answers.set('remind', remindPending());
    const p = principal(undefined, { requireOwnerApproval: false, allowNewRecipients: true });
    const out = ok(
      await call(
        w,
        'envelopes_remind',
        write({ envelope_id: ENVELOPE_ID, signer_id: SIGNER_ID }),
        p,
      ),
    );
    expect(EnvelopesRemindOutputSchema.safeParse(out).success).toBe(true);
    expect(out).toMatchObject({
      status: 'approval_pending',
      review_url: remindPending().review_url,
    });
    expect(findTokenShapedStrings(out)).toEqual([]);
    const [c] = w.calls;
    expect(c?.method).toBe('remind');
    expect(c?.cred.ownerId).toBe(OWNER);
    expect(c?.args.slice(0, 2)).toEqual([ENVELOPE_ID, SIGNER_ID]);
    // One transaction for the claim, one savepoint around the write.
    expect(w.atomicRuns.count).toBe(2);
  });

  it('keeps the hourly guard: remind_throttled with retry_after_seconds', async () => {
    const w = sendWorld();
    w.answers.set(
      'remind',
      new HttpException(
        { message: 'remind_throttled', retryAfter: 1800 },
        HttpStatus.TOO_MANY_REQUESTS,
      ),
    );
    const e = errorOf(
      await call(w, 'envelopes_remind', write({ envelope_id: ENVELOPE_ID, signer_id: SIGNER_ID })),
    );
    expect(e).toMatchObject({
      slug: 'remind_throttled',
      retryable: true,
      retry_after_seconds: 1800,
    });
  });

  it('respects signing order: a later step is not_your_turn', async () => {
    const w = sendWorld();
    w.answers.set('remind', new ConflictException('not_your_turn'));
    const e = errorOf(
      await call(w, 'envelopes_remind', write({ envelope_id: ENVELOPE_ID, signer_id: SIGNER_ID })),
    );
    expect(e.slug).toBe('not_your_turn');
  });

  it('dry_run names the signer and opens nothing', async () => {
    const w = sendWorld();
    w.answers.set('previewRemind', {
      envelope_id: ENVELOPE_ID,
      signer: { id: SIGNER_ID, name: 'Ada', email: 'ada@example.com' },
      approval: 'email',
    });
    const out = ok(
      await call(w, 'envelopes_remind', {
        idempotency_key: 'dry-run-0003',
        dry_run: true,
        envelope_id: ENVELOPE_ID,
        signer_id: SIGNER_ID,
      }),
    );
    expect(out['dry_run']).toBe(true);
    expect(w.calls.map((c) => c.method)).toEqual(['previewRemind']);
  });

  it('takes no confirmation_token and needs envelopes:send', async () => {
    const w = sendWorld();
    expect(
      errorOf(
        await call(
          w,
          'envelopes_remind',
          write({
            envelope_id: ENVELOPE_ID,
            signer_id: SIGNER_ID,
            confirmation_token: 'x'.repeat(43),
          }),
        ),
      ).slug,
    ).toBe('validation_error');
    expect(
      errorOf(await call(w, 'envelopes_remind', write({ envelope_id: ENVELOPE_ID }))).slug,
    ).toBe('validation_error');
    expect(
      errorOf(
        await call(
          w,
          'envelopes_remind',
          write({ envelope_id: ENVELOPE_ID, signer_id: SIGNER_ID }),
          principal(['envelopes:read', 'envelopes:write']),
        ),
      ).slug,
    ).toBe('insufficient_scope');
    expect(w.calls).toEqual([]);
  });
});
