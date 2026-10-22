import { ACCESS_CODE_POLICY, effectiveSignerAuth, maskEmail } from 'shared';
import {
  accessCodeMatches,
  challengeState,
  generateAccessCode,
  hashAccessCode,
  sendWaitSeconds,
  type ChallengeLike,
} from '../access-code';

const KEY = 'k'.repeat(40);
const BINDING = {
  challenge_id: '11111111-1111-4111-8111-111111111111',
  signer_id: '22222222-2222-4222-8222-222222222222',
  purpose: 'access' as const,
};

describe('access code helpers (WP-10)', () => {
  it('generates six zero-padded digits', () => {
    for (let i = 0; i < 200; i++) expect(generateAccessCode()).toMatch(/^[0-9]{6}$/);
  });

  it('hashes to 64 hex chars and binds the challenge, signer, purpose and key', () => {
    const h = hashAccessCode(KEY, BINDING, '123456');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashAccessCode(KEY, BINDING, '123456')).toBe(h);
    expect(hashAccessCode(KEY, { ...BINDING, purpose: 'action' }, '123456')).not.toBe(h);
    expect(hashAccessCode(KEY, { ...BINDING, signer_id: BINDING.challenge_id }, '123456')).not.toBe(
      h,
    );
    expect(hashAccessCode(KEY, { ...BINDING, challenge_id: BINDING.signer_id }, '123456')).not.toBe(
      h,
    );
    expect(hashAccessCode('o'.repeat(40), BINDING, '123456')).not.toBe(h);
    // The digest is not a bare hash of the code.
    expect(h).not.toContain('123456');
  });

  it('matches only the right code, never a missing or malformed stored hash', () => {
    const stored = hashAccessCode(KEY, BINDING, '042917');
    expect(accessCodeMatches(KEY, BINDING, '042917', stored)).toBe(true);
    expect(accessCodeMatches(KEY, BINDING, '042918', stored)).toBe(false);
    expect(accessCodeMatches(KEY, BINDING, '042917', null)).toBe(false);
    expect(accessCodeMatches(KEY, BINDING, '042917', 'zz')).toBe(false);
    expect(accessCodeMatches(KEY, BINDING, '042917', '0'.repeat(64))).toBe(false);
  });

  describe('challengeState', () => {
    const now = new Date('2026-10-22T12:00:00.000Z');
    const open: ChallengeLike = {
      code_hash: 'a'.repeat(64),
      attempts: 0,
      expires_at: new Date(now.getTime() + 60_000),
      consumed_at: null,
      locked_at: null,
      superseded_at: null,
    };

    it.each<[string, ChallengeLike | null, ReturnType<typeof challengeState>]>([
      ['open', open, null],
      ['no challenge', null, 'not_requested'],
      ['not dispatched yet', { ...open, code_hash: null }, 'not_requested'],
      ['already used (replay)', { ...open, consumed_at: now }, 'not_requested'],
      ['replaced by a newer code', { ...open, superseded_at: now }, 'not_requested'],
      ['locked', { ...open, locked_at: now }, 'locked'],
      ['out of attempts', { ...open, attempts: ACCESS_CODE_POLICY.maxAttempts }, 'locked'],
      ['expired', { ...open, expires_at: now }, 'expired'],
      ['locked wins over expired', { ...open, locked_at: now, expires_at: now }, 'locked'],
    ])('%s', (_label, c, expected) => {
      expect(challengeState(c, now)).toBe(expected);
    });
  });

  describe('sendWaitSeconds', () => {
    const now = new Date('2026-10-22T12:00:00.000Z');
    const ago = (s: number): Date => new Date(now.getTime() - s * 1000);

    it('allows the first send', () => {
      expect(sendWaitSeconds([], now)).toBeNull();
    });

    it('enforces the 60 s resend cooldown', () => {
      expect(sendWaitSeconds([ago(10)], now)).toEqual({ reason: 'cooldown', seconds: 50 });
      expect(sendWaitSeconds([ago(60)], now)).toBeNull();
    });

    it('caps sends at five per rolling hour', () => {
      const five = [ago(3000), ago(2400), ago(1800), ago(1200), ago(600)];
      expect(sendWaitSeconds(five, now)).toEqual({ reason: 'rate_limited', seconds: 600 });
      expect(sendWaitSeconds(five.slice(1), now)).toBeNull();
      // Older than an hour no longer counts.
      expect(sendWaitSeconds([ago(4000), ...five.slice(1)], now)).toBeNull();
    });
  });

  it('masks an address to its first character and domain', () => {
    expect(maskEmail('jane.doe@example.com')).toBe('j***@example.com');
    expect(maskEmail(' Ab@x.io ')).toBe('A***@x.io');
    expect(maskEmail('broken')).toBe('***');
  });

  it('lets a signer override the envelope default, null inherits', () => {
    expect(effectiveSignerAuth('email_otp', null)).toBe('email_otp');
    expect(effectiveSignerAuth('email_otp', 'none')).toBe('none');
    expect(effectiveSignerAuth('none', 'email_otp')).toBe('email_otp');
    expect(effectiveSignerAuth('none', undefined)).toBe('none');
  });
});
