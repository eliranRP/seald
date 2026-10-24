import { API_KEY_PREFIX } from 'shared';
import {
  SECRET_BODY_BYTES,
  SECRET_CHARS,
  generateApiKey,
  hashSecret,
  looksLikeApiKey,
  parseApiKey,
} from '../api-key-secret';
import { sha256Hex } from '../../common/sha256';

describe('api key secret format', () => {
  it('is seald_live_ + 32 random bytes base64url + a 6-char checksum', () => {
    const bytes = Buffer.alloc(SECRET_BODY_BYTES, 7);
    const key = generateApiKey(bytes);
    const body = bytes.toString('base64url');
    expect(body).toHaveLength(43);
    expect(key.token.startsWith(`${API_KEY_PREFIX}${body}`)).toBe(true);
    expect(key.token).toHaveLength(API_KEY_PREFIX.length + SECRET_CHARS);
    expect(key.token).toMatch(/^seald_live_[A-Za-z0-9_-]{49}$/);
  });

  it('prefix is seald_live_ + the first 8 secret characters', () => {
    const key = generateApiKey();
    const secret = key.token.slice(API_KEY_PREFIX.length);
    expect(key.prefix).toBe(`${API_KEY_PREFIX}${secret.slice(0, 8)}`);
  });

  it('key_hash is hex SHA-256 of the full secret, 64 chars', () => {
    const key = generateApiKey();
    const secret = key.token.slice(API_KEY_PREFIX.length);
    // Pins the stored format: hex SHA-256 of the secret. Verified against
    // an independent digest so existing key_hash rows keep matching.
    expect(key.keyHash).toBe(sha256Hex(secret));
    expect(key.keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSecret(secret)).toBe(key.keyHash);
  });

  it('two keys never share a secret', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) seen.add(generateApiKey().token);
    expect(seen.size).toBe(200);
  });

  it('rejects fewer or more than 32 random bytes', () => {
    expect(() => generateApiKey(Buffer.alloc(31))).toThrow();
    expect(() => generateApiKey(Buffer.alloc(33))).toThrow();
  });

  describe('parseApiKey', () => {
    it('round-trips a generated key', () => {
      const key = generateApiKey();
      expect(parseApiKey(key.token)).toEqual({ prefix: key.prefix, keyHash: key.keyHash });
    });

    it('a truncated paste fails closed', () => {
      const key = generateApiKey();
      expect(parseApiKey(key.token.slice(0, -1))).toBeNull();
      expect(parseApiKey(key.token.slice(0, 30))).toBeNull();
    });

    it('a single changed character fails the checksum', () => {
      const key = generateApiKey();
      const i = API_KEY_PREFIX.length + 10;
      const flipped = key.token[i] === 'A' ? 'B' : 'A';
      const tampered = `${key.token.slice(0, i)}${flipped}${key.token.slice(i + 1)}`;
      expect(parseApiKey(tampered)).toBeNull();
    });

    it('a changed checksum fails', () => {
      const key = generateApiKey();
      const last = key.token.endsWith('A') ? 'B' : 'A';
      expect(parseApiKey(`${key.token.slice(0, -1)}${last}`)).toBeNull();
    });

    it('rejects another prefix, whitespace and non-base64url characters', () => {
      const key = generateApiKey();
      const secret = key.token.slice(API_KEY_PREFIX.length);
      expect(parseApiKey(`seald_test_${secret}`)).toBeNull();
      expect(parseApiKey(secret)).toBeNull();
      expect(parseApiKey(` ${key.token}`)).toBeNull();
      expect(parseApiKey(`${key.token}\n`)).toBeNull();
      expect(parseApiKey(`${API_KEY_PREFIX}${'+'.repeat(49)}`)).toBeNull();
      expect(parseApiKey('')).toBeNull();
    });
  });

  it('looksLikeApiKey only checks the literal prefix', () => {
    expect(looksLikeApiKey('seald_live_x')).toBe(true);
    expect(looksLikeApiKey('eyJhbGciOi.x.y')).toBe(false);
  });

  it('keeps the legacy token and key_hash for fixed bytes (existing keys stay valid)', () => {
    const key = generateApiKey(Buffer.alloc(SECRET_BODY_BYTES, 7));
    expect(key.token).toBe('seald_live_BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcw1Mb56');
    expect(key.keyHash).toBe('228b7bc8d18ac55e0f296dad1e74d0ba71c8062202feb9c209e90302f4dfafd0');
    expect(parseApiKey(key.token)?.keyHash).toBe(key.keyHash);
  });
});
