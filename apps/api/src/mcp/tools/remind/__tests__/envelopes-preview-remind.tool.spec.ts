import { ConflictException } from '@nestjs/common';
import { EnvelopesPreviewRemindOutputSchema } from 'shared';
import {
  ENVELOPE_ID,
  SIGNER_ID,
  call,
  errorOf,
  ok,
  principal,
  sendWorld,
  write,
} from '../../send/__tests__/send-harness';

const SIGNER = { id: SIGNER_ID, name: 'Ada', email: 'ada@example.com' };

describe('envelopes_preview_remind', () => {
  it('returns the signer name and email, no token and no approval', async () => {
    const w = sendWorld();
    w.answers.set('previewRemind', { envelope_id: ENVELOPE_ID, signer: SIGNER, approval: 'email' });
    const out = ok(
      await call(
        w,
        'envelopes_preview_remind',
        write({ envelope_id: ENVELOPE_ID, signer_id: SIGNER_ID }),
      ),
    );
    expect(EnvelopesPreviewRemindOutputSchema.safeParse(out).success).toBe(true);
    expect(out).toEqual({ envelope_id: ENVELOPE_ID, signer: SIGNER, approval: 'email' });
    expect(JSON.stringify(out)).not.toMatch(/token|review_url/);
    expect(w.calls.map((c) => c.method)).toEqual(['previewRemind']);
  });

  it('surfaces the account owner as a signer', async () => {
    const w = sendWorld();
    w.answers.set('previewRemind', new ConflictException('signer_is_account_owner'));
    const e = errorOf(
      await call(
        w,
        'envelopes_preview_remind',
        write({ envelope_id: ENVELOPE_ID, signer_id: SIGNER_ID }),
      ),
    );
    expect(e.slug).toBe('signer_is_account_owner');
  });

  it('needs envelopes:send and both ids', async () => {
    const w = sendWorld();
    expect(
      errorOf(
        await call(
          w,
          'envelopes_preview_remind',
          write({ envelope_id: ENVELOPE_ID, signer_id: SIGNER_ID }),
          principal(['envelopes:read']),
        ),
      ).slug,
    ).toBe('insufficient_scope');
    expect(
      errorOf(await call(w, 'envelopes_preview_remind', write({ envelope_id: ENVELOPE_ID }))).slug,
    ).toBe('validation_error');
  });
});
