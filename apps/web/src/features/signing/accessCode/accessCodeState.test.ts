import { describe, expect, it } from 'vitest';
import type { AccessCodeFailure, AccessCodeFailureKind } from './accessCodeErrors';
import {
  INITIAL_ACCESS_CODE_STATE,
  accessCodeReducer,
  failureOf,
  isBusy,
  showsCodeInput,
} from './accessCodeState';
import type { AccessCodeState } from './accessCodeState';

function failure(kind: AccessCodeFailureKind, retryAfterSeconds: number | null = null) {
  return { kind, message: kind, retryAfterSeconds } satisfies AccessCodeFailure;
}

const READY: AccessCodeState = { phase: { kind: 'ready', failure: null }, cooldownUntil: 0 };

describe('accessCodeReducer', () => {
  it('first send: idle -> sending (busy, no field) -> ready with a cooldown', () => {
    const sending = accessCodeReducer(INITIAL_ACCESS_CODE_STATE, { type: 'send' });
    expect(sending.phase).toEqual({ kind: 'sending' });
    expect(isBusy(sending.phase)).toBe(true);
    expect(showsCodeInput(sending.phase)).toBe(false);
    const ready = accessCodeReducer(sending, { type: 'sent', at: 1_000, resendAfterSeconds: 30 });
    expect(ready).toEqual({ phase: { kind: 'ready', failure: null }, cooldownUntil: 31_000 });
    expect(isBusy(ready.phase)).toBe(false);
  });

  it('a resend keeps the field on screen while busy', () => {
    const resending = accessCodeReducer(READY, { type: 'send' });
    expect(resending.phase).toEqual({ kind: 'resending' });
    expect(showsCodeInput(resending.phase)).toBe(true);
    expect(isBusy(resending.phase)).toBe(true);
  });

  it('ignores a send while a request is out', () => {
    const sending = accessCodeReducer(INITIAL_ACCESS_CODE_STATE, { type: 'send' });
    expect(accessCodeReducer(sending, { type: 'send' })).toBe(sending);
    const submitting = accessCodeReducer(READY, { type: 'submit' });
    expect(accessCodeReducer(submitting, { type: 'send' })).toBe(submitting);
  });

  it('a cooldown failure on send still lets the signer type the live code', () => {
    const sending = accessCodeReducer(INITIAL_ACCESS_CODE_STATE, { type: 'send' });
    const next = accessCodeReducer(sending, {
      type: 'send-failed',
      at: 2_000,
      failure: failure('cooldown', 45),
    });
    expect(next.phase).toEqual({ kind: 'ready', failure: failure('cooldown', 45) });
    expect(next.cooldownUntil).toBe(47_000);
  });

  it('any other send failure goes back to idle and keeps the earlier cooldown', () => {
    const resending = accessCodeReducer({ ...READY, cooldownUntil: 9_000 }, { type: 'send' });
    const next = accessCodeReducer(resending, {
      type: 'send-failed',
      at: 2_000,
      failure: failure('unavailable'),
    });
    expect(next).toEqual({
      phase: { kind: 'idle', failure: failure('unavailable') },
      cooldownUntil: 9_000,
    });
    expect(failureOf(next.phase)).toEqual(failure('unavailable'));
  });

  it('submit only from ready; success ends in verified, not a stuck busy flag', () => {
    expect(accessCodeReducer(INITIAL_ACCESS_CODE_STATE, { type: 'submit' })).toBe(
      INITIAL_ACCESS_CODE_STATE,
    );
    const submitting = accessCodeReducer(READY, { type: 'submit' });
    expect(submitting.phase).toEqual({ kind: 'submitting' });
    const verified = accessCodeReducer(submitting, { type: 'verified' });
    expect(verified.phase).toEqual({ kind: 'verified' });
    expect(isBusy(verified.phase)).toBe(true);
    expect(showsCodeInput(verified.phase)).toBe(true);
    expect(failureOf(verified.phase)).toBeNull();
  });

  it('a wrong code returns to ready with the failure', () => {
    const submitting = accessCodeReducer(READY, { type: 'submit' });
    const next = accessCodeReducer(submitting, {
      type: 'submit-failed',
      at: 0,
      failure: failure('invalid'),
    });
    expect(next.phase).toEqual({ kind: 'ready', failure: failure('invalid') });
  });

  it.each(['locked', 'expired', 'not-requested'] as const)(
    'a %s code asks for a new one',
    (kind) => {
      const submitting = accessCodeReducer(READY, { type: 'submit' });
      const next = accessCodeReducer(submitting, {
        type: 'submit-failed',
        at: 0,
        failure: failure(kind),
      });
      expect(next.phase).toEqual({ kind: 'needs-new', failure: failure(kind) });
      expect(showsCodeInput(next.phase)).toBe(false);
      expect(accessCodeReducer(next, { type: 'send' }).phase).toEqual({ kind: 'sending' });
    },
  );

  it('drops answers that do not match the request in flight', () => {
    expect(accessCodeReducer(READY, { type: 'sent', at: 0, resendAfterSeconds: 30 })).toBe(READY);
    expect(accessCodeReducer(READY, { type: 'verified' })).toBe(READY);
    expect(
      accessCodeReducer(READY, { type: 'submit-failed', at: 0, failure: failure('invalid') }),
    ).toBe(READY);
  });
});
