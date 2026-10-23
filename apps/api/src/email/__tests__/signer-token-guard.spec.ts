import {
  containsSigningLinkWithToken,
  findSignerTokenInPayload,
} from '../outbound-emails.repository';

const TOKEN = 'A'.repeat(43);
const ENVELOPE = '0b6c3f2e-1d4a-4c8e-9f00-123456789abc';

describe('signer token guard', () => {
  it.each([
    [`https://seald.example/sign/${ENVELOPE}?t=${TOKEN}`],
    [`/sign/${ENVELOPE}?a=1&t=${TOKEN}`],
    [`{"link":"/sign/${ENVELOPE}?t=${TOKEN}"}`],
  ])('detects a signing link with a token: %s', (text) => {
    expect(containsSigningLinkWithToken(text)).toBe(true);
  });

  it.each([
    ['Lease?t=final'],
    ['Q&t=2 plan'],
    ['see /sign/here?t=short'],
    [`/sign/${ENVELOPE} then ?t=${TOKEN}`],
    [`"/sign/${ENVELOPE}" "?t=${TOKEN}"`],
  ])('ignores text that is not a tokened signing link: %s', (text) => {
    expect(containsSigningLinkWithToken(text)).toBe(false);
  });

  it('flags the legacy sign_url key and an embedded link', () => {
    expect(findSignerTokenInPayload({ sign_url: 'x' })).toBe('payload_key:sign_url');
    expect(findSignerTokenInPayload({ note: `/sign/${ENVELOPE}?t=${TOKEN}` })).toBe(
      'payload_signing_link',
    );
    expect(findSignerTokenInPayload({ title: 'Lease?t=final' })).toBeNull();
  });

  it('stays linear on input that repeats /sign/ (ReDoS guard)', () => {
    const hostile = '/sign/'.repeat(200_000) + '?t=short';
    const started = Date.now();
    expect(containsSigningLinkWithToken(hostile)).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
