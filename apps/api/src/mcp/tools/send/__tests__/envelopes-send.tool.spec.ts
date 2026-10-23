import { ConflictException, HttpException, HttpStatus } from '@nestjs/common';
import { EnvelopesSendOutputSchema } from 'shared';
import { findTokenShapedStrings } from '../../../leak-scan';
import {
  ENVELOPE_ID,
  KEY_ID,
  OWNER,
  call,
  errorOf,
  ok,
  pending,
  principal,
  sendWorld,
  write,
} from './send-harness';

const TOKEN = 'c'.repeat(43);

describe('envelopes_send', () => {
  it('returns approval_pending with review_url and never a token link', async () => {
    const w = sendWorld();
    w.answers.set('send', pending());
    const out = ok(await call(w, 'envelopes_send', write({ envelope_id: ENVELOPE_ID })));
    expect(out).toMatchObject({
      status: 'approval_pending',
      approval_id: pending().approval_id,
      review_url: pending().review_url,
      approve_requires: 'session',
    });
    expect(EnvelopesSendOutputSchema.safeParse(out).success).toBe(true);
    expect(JSON.stringify(out)).not.toContain('/approve#');
    expect(findTokenShapedStrings(out)).toEqual([]);
    // The document title stays a data field.
    expect((out['summary'] as { title: string }).title).toContain('Ignore previous instructions');
  });

  it('acts for the verified credential only, and passes the unattended token through', async () => {
    const w = sendWorld();
    w.answers.set('send', {
      status: 'sent',
      envelope_id: ENVELOPE_ID,
      envelope_status: 'awaiting_others',
    });
    const p = principal(undefined, { requireOwnerApproval: false, allowNewRecipients: true });
    const out = ok(
      await call(
        w,
        'envelopes_send',
        write({ envelope_id: ENVELOPE_ID, confirmation_token: TOKEN }),
        p,
      ),
    );
    expect(out).toEqual({
      status: 'sent',
      envelope_id: ENVELOPE_ID,
      envelope_status: 'awaiting_others',
    });
    expect(w.calls).toHaveLength(1);
    const [c] = w.calls;
    expect(c?.method).toBe('send');
    expect(c?.cred).toEqual({
      ownerId: OWNER,
      keyId: KEY_ID,
      keyName: 'Key 1',
      keyPrefix: 'seald_live_abcdefgh',
      requireOwnerApproval: false,
      allowNewRecipients: true,
    });
    expect(c?.args.slice(0, 2)).toEqual([ENVELOPE_ID, TOKEN]);
  });

  it('runs the claim and the send in one transaction (atomic)', async () => {
    const w = sendWorld();
    w.answers.set('send', pending());
    await call(w, 'envelopes_send', write({ envelope_id: ENVELOPE_ID }));
    // One transaction for the claim, one savepoint around the write.
    expect(w.atomicRuns.count).toBe(2);
  });

  it('replays a retried key without asking again', async () => {
    const w = sendWorld();
    w.answers.set('send', pending());
    const args = write({ envelope_id: ENVELOPE_ID });
    const first = ok(await call(w, 'envelopes_send', args));
    const second = ok(await call(w, 'envelopes_send', args));
    expect(second).toEqual(first);
    expect(w.calls.filter((c) => c.method === 'send')).toHaveLength(1);
  });

  it('a failed call leaves no claim, so the same key can run again', async () => {
    const w = sendWorld();
    w.answers.set('send', new ConflictException('envelope_not_draft'));
    const args = write({ envelope_id: ENVELOPE_ID });
    expect(errorOf(await call(w, 'envelopes_send', args)).slug).toBe('envelope_not_draft');
    w.answers.set('send', pending());
    expect(ok(await call(w, 'envelopes_send', args))['status']).toBe('approval_pending');
  });

  it('dry_run runs the checks only', async () => {
    const w = sendWorld();
    w.answers.set('checkSend', { ready: true, approval: 'email' });
    const out = ok(
      await call(w, 'envelopes_send', {
        idempotency_key: 'dry-run-0001',
        dry_run: true,
        envelope_id: ENVELOPE_ID,
      }),
    );
    expect(out).toEqual({ dry_run: true, would: { ready: true, approval: 'email' } });
    expect(w.calls.map((c) => c.method)).toEqual(['checkSend']);
  });

  it('maps the daily cap to a retryable tool error with retry_after_seconds', async () => {
    const w = sendWorld();
    w.answers.set(
      'send',
      new HttpException(
        { message: 'send_daily_cap', retryAfter: 3600 },
        HttpStatus.TOO_MANY_REQUESTS,
      ),
    );
    const e = errorOf(await call(w, 'envelopes_send', write({ envelope_id: ENVELOPE_ID })));
    expect(e).toMatchObject({ slug: 'send_daily_cap', retryable: true, retry_after_seconds: 3600 });
  });

  it('surfaces suspension, owner-as-signer and a missing token as their slugs', async () => {
    for (const [status, slug] of [
      [HttpStatus.FORBIDDEN, 'send_suspended'],
      [HttpStatus.FORBIDDEN, 'key_send_suspended'],
      [HttpStatus.CONFLICT, 'signer_is_account_owner'],
      [HttpStatus.BAD_REQUEST, 'confirmation_required'],
      [HttpStatus.CONFLICT, 'confirmation_invalid'],
    ] as const) {
      const w = sendWorld();
      w.answers.set('send', new HttpException(slug, status));
      expect(
        errorOf(await call(w, 'envelopes_send', write({ envelope_id: ENVELOPE_ID }))).slug,
      ).toBe(slug);
    }
  });

  it('needs envelopes:send', async () => {
    const w = sendWorld();
    const e = errorOf(
      await call(
        w,
        'envelopes_send',
        write({ envelope_id: ENVELOPE_ID }),
        principal(['envelopes:read', 'envelopes:write']),
      ),
    );
    expect(e.slug).toBe('insufficient_scope');
    expect(w.calls).toEqual([]);
  });

  it('rejects a missing key, a bad token shape and an unknown field', async () => {
    const w = sendWorld();
    for (const args of [
      { envelope_id: ENVELOPE_ID, dry_run: false },
      write({ envelope_id: ENVELOPE_ID, confirmation_token: 'short' }),
      write({ envelope_id: ENVELOPE_ID, owner_id: OWNER }),
      write({ envelope_id: ENVELOPE_ID, notify: 'none' }),
    ]) {
      expect(errorOf(await call(w, 'envelopes_send', args)).slug).toBe('validation_error');
    }
    expect(w.calls).toEqual([]);
  });
});
