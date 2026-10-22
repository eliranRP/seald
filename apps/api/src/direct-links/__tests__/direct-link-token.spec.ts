import {
  generateDirectLinkToken,
  hashClaimEmail,
  hashDirectLinkToken,
  isWellFormedDirectLinkToken,
} from '../direct-link-token';

describe('direct link token', () => {
  it('is dl_ plus 43 base64url characters (256 bits)', () => {
    const { token } = generateDirectLinkToken();
    expect(token).toMatch(/^dl_[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token.slice(3), 'base64url')).toHaveLength(32);
  });

  it('never repeats', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateDirectLinkToken().token));
    expect(seen.size).toBe(200);
  });

  it('stores only a 64-hex hash that does not contain the token', () => {
    const { token, tokenHash, prefix } = generateDirectLinkToken();
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toBe(hashDirectLinkToken(token));
    expect(tokenHash).not.toContain(token.slice(3, 15));
    expect(prefix).toBe(token.slice(0, 9));
    expect(prefix.length).toBeLessThan(token.length / 2);
  });

  it('rejects malformed tokens before any lookup', () => {
    expect(isWellFormedDirectLinkToken(`dl_${'a'.repeat(43)}`)).toBe(true);
    for (const bad of [
      '',
      'dl_',
      `dl_${'a'.repeat(42)}`,
      `dl_${'a'.repeat(44)}`,
      `xx_${'a'.repeat(43)}`,
      `dl_${'a'.repeat(42)}!`,
      ` dl_${'a'.repeat(43)}`,
    ]) {
      expect(isWellFormedDirectLinkToken(bad)).toBe(false);
    }
  });

  it('hashes visitor emails case-insensitively without keeping the address', () => {
    expect(hashClaimEmail('Ada@Example.org ')).toBe(hashClaimEmail('ada@example.org'));
    expect(hashClaimEmail('ada@example.org')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashClaimEmail('a@example.org')).not.toBe(hashClaimEmail('b@example.org'));
  });
});
