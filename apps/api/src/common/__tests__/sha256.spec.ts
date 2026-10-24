import { sha256Base64url, sha256Hex } from '../sha256';

describe('sha256 fingerprint helper', () => {
  it('matches the SHA-256 test vector (stored hashes stay valid)', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('base64url form is the same digest', () => {
    expect(Buffer.from(sha256Base64url('abc'), 'base64url').toString('hex')).toBe(sha256Hex('abc'));
  });

  it('hashes utf8 consistently', () => {
    expect(sha256Hex('é')).toBe(sha256Hex('\u00e9'));
    expect(sha256Hex('é')).toMatch(/^[0-9a-f]{64}$/);
  });
});
