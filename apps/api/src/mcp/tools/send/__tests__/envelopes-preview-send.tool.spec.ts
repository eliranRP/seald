import { HttpException, HttpStatus } from '@nestjs/common';
import { EnvelopesPreviewSendOutputSchema, type EnvelopesPreviewSendOutput } from 'shared';
import { findTokenShapedStrings } from '../../../leak-scan';
import {
  ENVELOPE_ID,
  call,
  errorOf,
  ok,
  pending,
  principal,
  sendWorld,
  write,
} from './send-harness';

const TOKEN = 't'.repeat(43);

function preview(overrides: Partial<EnvelopesPreviewSendOutput> = {}): EnvelopesPreviewSendOutput {
  return {
    ready: true,
    summary: {
      title: 'NDA',
      signers: [{ name: 'Ada', email: 'ada@example.com', signer_is_account_owner: false }],
      field_count: 1,
      expires_at: '2026-11-01T00:00:00.000Z',
      file_sha256: 'a'.repeat(64),
    },
    signer_is_account_owner: false,
    approval: 'email',
    approval_id: pending().approval_id,
    review_url: pending().review_url,
    approve_requires: 'session',
    ...overrides,
  };
}

describe('envelopes_preview_send', () => {
  it('on the approval path opens the approval and returns review_url, no token', async () => {
    const w = sendWorld();
    w.answers.set('previewSend', preview());
    const out = ok(await call(w, 'envelopes_preview_send', write({ envelope_id: ENVELOPE_ID })));
    expect(EnvelopesPreviewSendOutputSchema.safeParse(out).success).toBe(true);
    expect(out).toMatchObject({ ready: true, approval: 'email', review_url: pending().review_url });
    expect(out).not.toHaveProperty('confirmation_token');
    expect(findTokenShapedStrings(out)).toEqual([]);
    // One transaction for the claim, one savepoint around the write.
    expect(w.atomicRuns.count).toBe(2);
  });

  it('on the unattended path returns the 10-minute token, and a replay never repeats it', async () => {
    const w = sendWorld();
    w.answers.set(
      'previewSend',
      preview({
        approval: 'none',
        approval_id: null,
        review_url: null,
        approve_requires: null,
        confirmation_token: TOKEN,
        expires_in_seconds: 600,
      }),
    );
    const p = principal(undefined, { requireOwnerApproval: false });
    const args = write({ envelope_id: ENVELOPE_ID });
    const first = ok(await call(w, 'envelopes_preview_send', args, p));
    expect(first).toMatchObject({
      approval: 'none',
      confirmation_token: TOKEN,
      expires_in_seconds: 600,
    });
    // The stored response has no token: the idempotency row never holds it.
    expect(JSON.stringify([...w.idempotencyRepo.rows.values()])).not.toContain(TOKEN);
    const replay = ok(await call(w, 'envelopes_preview_send', args, p));
    expect(replay).not.toHaveProperty('confirmation_token');
    expect(replay).not.toHaveProperty('expires_in_seconds');
    expect(replay['approval']).toBe('none');
    expect(w.calls.filter((c) => c.method === 'previewSend')).toHaveLength(1);
  });

  it('reports signer_is_account_owner as not ready, with the note', async () => {
    const w = sendWorld();
    w.answers.set(
      'previewSend',
      preview({
        ready: false,
        signer_is_account_owner: true,
        approval: 'none',
        approval_id: null,
        review_url: null,
        approve_requires: null,
        summary: {
          ...preview().summary,
          note: 'You are a signer. Send this from Seald instead.',
        },
      }),
    );
    const out = ok(await call(w, 'envelopes_preview_send', write({ envelope_id: ENVELOPE_ID })));
    expect(out).toMatchObject({ ready: false, signer_is_account_owner: true });
  });

  it('dry_run runs the checks only', async () => {
    const w = sendWorld();
    w.answers.set('checkSend', { ready: true });
    const out = ok(
      await call(w, 'envelopes_preview_send', {
        idempotency_key: 'dry-run-0002',
        dry_run: true,
        envelope_id: ENVELOPE_ID,
      }),
    );
    expect(out).toEqual({ dry_run: true, would: { ready: true } });
    expect(w.calls.map((c) => c.method)).toEqual(['checkSend']);
  });

  it('maps a draft that is not ready to its slug', async () => {
    const w = sendWorld();
    w.answers.set('previewSend', new HttpException('no_fields', HttpStatus.BAD_REQUEST));
    expect(
      errorOf(await call(w, 'envelopes_preview_send', write({ envelope_id: ENVELOPE_ID }))).slug,
    ).toBe('no_fields');
  });

  it('needs envelopes:send, and takes no confirmation_token', async () => {
    const w = sendWorld();
    expect(
      errorOf(
        await call(
          w,
          'envelopes_preview_send',
          write({ envelope_id: ENVELOPE_ID }),
          principal(['envelopes:read']),
        ),
      ).slug,
    ).toBe('insufficient_scope');
    expect(
      errorOf(
        await call(
          w,
          'envelopes_preview_send',
          write({ envelope_id: ENVELOPE_ID, confirmation_token: TOKEN }),
        ),
      ).slug,
    ).toBe('validation_error');
    expect(w.calls).toEqual([]);
  });
});
