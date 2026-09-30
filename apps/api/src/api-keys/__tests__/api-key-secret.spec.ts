import { createHash } from 'node:crypto';
import { API_KEY_TOKEN_PREFIX } from 'shared';
import { generateApiKey, hashesEqual, nextKeyName, parseApiKeyToken } from '../api-key-secret';

describe('api key secret', () => {
  it('builds a seald_live_ token, an 8-character prefix, and a sha-256 hash', () => {
    const key = generateApiKey();
    expect(key.token.startsWith(API_KEY_TOKEN_PREFIX)).toBe(true);
    expect(key.prefix).toBe(
      `${API_KEY_TOKEN_PREFIX}${key.token.slice(API_KEY_TOKEN_PREFIX.length, API_KEY_TOKEN_PREFIX.length + 8)}`,
    );
    expect(key.keyHash).toHaveLength(64);
    expect(key.keyHash).toBe(createHash('sha256').update(key.token).digest('hex'));
    expect(key.keyHash).not.toBe(key.token);
    const parsed = parseApiKeyToken(key.token);
    expect(parsed).toEqual({ prefix: key.prefix, keyHash: key.keyHash });
  });

  it('rejects a truncated paste and a bad checksum before any lookup', () => {
    const key = generateApiKey();
    expect(parseApiKeyToken(key.token.slice(0, -1))).toBeNull();
    expect(parseApiKeyToken('not-a-key')).toBeNull();
    expect(parseApiKeyToken(`${API_KEY_TOKEN_PREFIX}${'a'.repeat(51)}`)).toBeNull();
    const flipped = `${key.token.slice(0, -1)}${key.token.endsWith('0') ? '1' : '0'}`;
    expect(parseApiKeyToken(flipped)).toBeNull();
  });

  it('compares hashes in constant time and fails a length mismatch', () => {
    const key = generateApiKey();
    expect(hashesEqual(key.keyHash, key.keyHash)).toBe(true);
    expect(hashesEqual(key.keyHash, 'ab')).toBe(false);
    expect(hashesEqual('zz', key.keyHash)).toBe(false);
  });

  it('picks the next free Key N, skipping live names', () => {
    expect(nextKeyName([])).toBe('Key 1');
    expect(nextKeyName(['Key 1', 'Key 3'])).toBe('Key 2');
    expect(nextKeyName(['key 1'])).toBe('Key 2');
  });
});
