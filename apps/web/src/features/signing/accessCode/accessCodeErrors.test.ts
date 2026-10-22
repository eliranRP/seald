import { describe, expect, it } from 'vitest';
import { describeAccessCodeError, isAccessCodeRequiredError } from './accessCodeErrors';

const err = (status: number, code?: string, retryAfterSeconds?: number) =>
  Object.assign(new Error(code ?? 'x'), {
    status,
    ...(code !== undefined ? { code } : {}),
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
  });

describe('describeAccessCodeError', () => {
  it.each([
    [422, 'access_code_invalid', 'invalid'],
    [423, 'access_code_locked', 'locked'],
    [410, 'access_code_expired', 'expired'],
    [409, 'access_code_not_requested', 'not-requested'],
    [503, 'access_code_unavailable', 'unavailable'],
    [401, undefined, 'session'],
    [500, undefined, 'generic'],
  ] as const)('maps %s %s to %s', (status, code, kind) => {
    expect(describeAccessCodeError(err(status, code)).kind).toBe(kind);
  });

  it('tells the two 429s apart and reads Retry-After', () => {
    const cooldown = describeAccessCodeError(err(429, 'access_code_cooldown', 42));
    expect(cooldown).toMatchObject({ kind: 'cooldown', retryAfterSeconds: 42 });
    const limited = describeAccessCodeError(err(429, 'access_code_rate_limited', 1800));
    expect(limited.kind).toBe('rate-limited');
    expect(limited.message).toMatch(/30 minutes/);
  });

  it('falls back to the resend cooldown when the Retry-After header is not readable', () => {
    expect(describeAccessCodeError(err(429, 'access_code_cooldown')).retryAfterSeconds).toBe(60);
  });

  it('never claims the signer was identified', () => {
    for (const status of [409, 410, 422, 423, 429, 503, 401]) {
      expect(describeAccessCodeError(err(status)).message).not.toMatch(/identity|verified/i);
    }
  });
});

describe('isAccessCodeRequiredError', () => {
  it('matches 428 and the slug', () => {
    expect(isAccessCodeRequiredError(err(428))).toBe(true);
    expect(isAccessCodeRequiredError(err(400, 'access_code_required'))).toBe(true);
    expect(isAccessCodeRequiredError(err(422, 'access_code_invalid'))).toBe(false);
    expect(isAccessCodeRequiredError(null)).toBe(false);
  });
});
