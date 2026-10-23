import { BadRequestException, ConflictException } from '@nestjs/common';
import { EnvelopesChangeExpiryOutputSchema } from 'shared';
import { findTokenShapedStrings } from '../../../leak-scan';
import {
  ENVELOPE_ID,
  OWNER,
  call,
  dry,
  errorOf,
  laterWorld,
  ok,
  pending,
  principal,
  write,
} from './later-harness';

const EXPIRES = '2026-11-15T10:00:00.000Z';

describe('envelopes_change_expiry', () => {
  it('returns approval_pending with approve_requires session', async () => {
    const w = laterWorld();
    w.answers.set(
      'envelopeActions.changeExpiry',
      pending({
        summary: { ...pending().summary, kind: 'envelope_change_expiry' },
      }),
    );
    const p = principal(undefined, { requireOwnerApproval: false });
    const out = ok(
      await call(
        w,
        'envelopes_change_expiry',
        write({ envelope_id: ENVELOPE_ID, expires_at: EXPIRES }),
        p,
      ),
    );
    expect(EnvelopesChangeExpiryOutputSchema.safeParse(out).success).toBe(true);
    expect(out).toMatchObject({ status: 'approval_pending', approve_requires: 'session' });
    expect(findTokenShapedStrings(out)).toEqual([]);
    const [c] = w.calls;
    expect((c?.args[0] as { ownerId: string }).ownerId).toBe(OWNER);
    expect(c?.args.slice(1, 3)).toEqual([ENVELOPE_ID, EXPIRES]);
    expect(w.atomicRuns.count).toBe(2);
  });

  it('rejects a time that is not ISO 8601', async () => {
    const w = laterWorld();
    expect(
      errorOf(
        await call(
          w,
          'envelopes_change_expiry',
          write({ envelope_id: ENVELOPE_ID, expires_at: 'next tuesday' }),
        ),
      ).slug,
    ).toBe('validation_error');
    expect(w.calls).toEqual([]);
  });

  it('passes through the service slugs', async () => {
    const w = laterWorld();
    w.answers.set('envelopeActions.changeExpiry', new BadRequestException('expiry_out_of_range'));
    expect(
      errorOf(
        await call(
          w,
          'envelopes_change_expiry',
          write({ envelope_id: ENVELOPE_ID, expires_at: EXPIRES }),
        ),
      ).slug,
    ).toBe('expiry_out_of_range');
    w.answers.set('envelopeActions.changeExpiry', new ConflictException('envelope_terminal'));
    expect(
      errorOf(
        await call(
          w,
          'envelopes_change_expiry',
          write({ envelope_id: ENVELOPE_ID, expires_at: EXPIRES }),
        ),
      ).slug,
    ).toBe('envelope_terminal');
  });

  it('dry_run runs the checks only', async () => {
    const w = laterWorld();
    w.answers.set('envelopeActions.checkChangeExpiry', { expires_at: EXPIRES });
    const out = ok(
      await call(
        w,
        'envelopes_change_expiry',
        dry({ envelope_id: ENVELOPE_ID, expires_at: EXPIRES }),
      ),
    );
    expect(out).toEqual({ dry_run: true, would: { expires_at: EXPIRES } });
    expect(w.calls.map((c) => c.method)).toEqual(['checkChangeExpiry']);
  });
});
