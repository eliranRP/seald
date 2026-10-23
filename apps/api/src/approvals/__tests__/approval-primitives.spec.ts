import type { AppEnv } from '../../config/env.schema';
import { ApprovalCsrf } from '../approval-csrf';
import { ApprovalRateLimiter } from '../approval-rate-limiter';
import {
  generateApprovalToken,
  hashApprovalToken,
  looksLikeApprovalToken,
} from '../approval-token';
import { computeSubjectHash, type SubjectFacts } from '../subject-hash';

const env = (over: Partial<AppEnv> = {}): AppEnv =>
  ({ NODE_ENV: 'test', APP_PUBLIC_URL: 'https://seald.test', ...over }) as AppEnv;

const FACTS: SubjectFacts = {
  kind: 'envelope_send',
  recipients: [
    { name: 'Ada', email: 'ada@example.com' },
    { name: 'Bob', email: 'bob@example.com' },
  ],
  pageCount: 3,
  keyName: 'Key 2',
  approverEmail: 'owner@example.com',
  destination: null,
  files: ['a'.repeat(64)],
  fields: [
    {
      id: 'f1',
      signer_id: 's1',
      document_id: null,
      kind: 'signature',
      page: 1,
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.05,
    },
  ],
};

describe('approval tokens', () => {
  it('are 43 base64url characters and only their SHA-256 hex is stored', () => {
    const minted = generateApprovalToken();
    expect(looksLikeApprovalToken(minted.token)).toBe(true);
    expect(minted.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(minted.hash).toBe(hashApprovalToken(minted.token));
    expect(generateApprovalToken().token).not.toBe(minted.token);
    expect(looksLikeApprovalToken('short')).toBe(false);
    expect(looksLikeApprovalToken(42)).toBe(false);
  });
});

describe('subject_hash', () => {
  it('is stable for the same facts in any recipient or field order, and email case', () => {
    const shuffled: SubjectFacts = {
      ...FACTS,
      recipients: [
        { name: 'Bob', email: 'BOB@example.com' },
        { name: 'Ada', email: 'ada@example.com' },
      ],
    };
    expect(computeSubjectHash(shuffled)).toBe(computeSubjectHash(FACTS));
    expect(computeSubjectHash(FACTS)).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ['a field move', { fields: [{ ...FACTS.fields[0]!, x: 0.11 }] }],
    ['a reassigned field', { fields: [{ ...FACTS.fields[0]!, signer_id: 's2' }] }],
    ['a PDF swap', { files: ['b'.repeat(64)] }],
    [
      'a recipient name',
      { recipients: [{ name: 'Ada L', email: 'ada@example.com' }, FACTS.recipients[1]!] },
    ],
    [
      'an added recipient',
      { recipients: [...FACTS.recipients, { name: 'C', email: 'c@example.com' }] },
    ],
    ['the page count', { pageCount: 4 }],
    ['the key name', { keyName: 'Key 3' }],
    ['the approver email', { approverEmail: 'new@example.com' }],
    ['the action', { kind: 'envelope_cancel' as const }],
    ['a destination', { destination: { kind: 'drive_folder' as const, label: 'Q3' } }],
    ['a kind-specific fact', { extra: { folder_id: 'x' } }],
  ])('changes with %s', (_label, change) => {
    expect(computeSubjectHash({ ...FACTS, ...change })).not.toBe(computeSubjectHash(FACTS));
  });
});

describe('ApprovalCsrf', () => {
  it('binds the value to the approval and the nonce', () => {
    const csrf = new ApprovalCsrf(env({ APPROVAL_CSRF_KEY: 'k'.repeat(40) }));
    const issued = csrf.issue('approval-1');
    expect(issued.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(csrf.verify('approval-1', issued.nonce, issued.value)).toBe(true);
    expect(csrf.verify('approval-2', issued.nonce, issued.value)).toBe(false);
    expect(csrf.verify('approval-1', csrf.issue('approval-1').nonce, issued.value)).toBe(false);
    expect(csrf.verify('approval-1', undefined, issued.value)).toBe(false);
    expect(csrf.verify('approval-1', issued.nonce, undefined)).toBe(false);
    expect(csrf.verify('approval-1', issued.nonce, `${issued.value.slice(0, -1)}A`)).toBe(
      issued.value.endsWith('A'),
    );
  });

  it('a value from another server key does not verify', () => {
    const a = new ApprovalCsrf(env({ APPROVAL_CSRF_KEY: 'a'.repeat(40) }));
    const b = new ApprovalCsrf(env({ APPROVAL_CSRF_KEY: 'b'.repeat(40) }));
    const issued = a.issue('x');
    expect(b.verify('x', issued.nonce, issued.value)).toBe(false);
  });

  it('uses a __Host- Secure cookie in production only', () => {
    expect(
      new ApprovalCsrf(env({ NODE_ENV: 'production', APPROVAL_CSRF_KEY: 'k'.repeat(40) }))
        .cookieName,
    ).toBe('__Host-seald_approval');
    const dev = new ApprovalCsrf(env());
    expect(dev.cookieName).toBe('seald_approval');
    expect(dev.secureCookie).toBe(false);
  });
});

describe('ApprovalRateLimiter', () => {
  it('allows 10 calls per minute per key, then 429 rate_limited until the window rolls', () => {
    const limiter = new ApprovalRateLimiter(env({ NODE_ENV: 'production' }));
    const t0 = 1_000_000;
    for (let i = 0; i < 10; i += 1) limiter.check(['ip:1', 'token:a'], t0 + i);
    expect(() => limiter.check(['ip:1', 'token:b'], t0 + 20)).toThrow(
      expect.objectContaining({ status: 429 }),
    );
    // Another IP and token are unaffected.
    expect(() => limiter.check(['ip:2', 'token:c'], t0 + 20)).not.toThrow();
    // A token is limited across IPs too.
    for (let i = 0; i < 10; i += 1) limiter.check([`ip:x${i}`, 'token:q'], t0 + 30);
    expect(() => limiter.check(['ip:y', 'token:q'], t0 + 40)).toThrow();
    expect(() => limiter.check(['ip:1', 'token:z'], t0 + 60_001)).not.toThrow();
  });

  it('is off under NODE_ENV=test, like the throttler', () => {
    const limiter = new ApprovalRateLimiter(env());
    for (let i = 0; i < 50; i += 1) limiter.check(['ip:1'], 5);
  });
});
