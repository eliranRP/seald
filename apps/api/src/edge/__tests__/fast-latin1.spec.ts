import { randomBytes } from 'node:crypto';
import { decodeLatin1, installFastLatin1 } from '../fast-latin1';

describe('fast latin1 decoding (Edge Functions)', () => {
  const allBytes = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
  const big = randomBytes(3 * 0x2000 + 17);

  it('decodes exactly like Node latin1, across chunk boundaries', () => {
    expect(decodeLatin1(allBytes)).toBe(allBytes.toString('latin1'));
    expect(decodeLatin1(big)).toBe(big.toString('latin1'));
    expect(decodeLatin1(big, 5, 0x2000 + 9)).toBe(big.toString('latin1', 5, 0x2000 + 9));
  });

  it('once installed, Buffer#toString keeps Node semantics for every encoding and bound', () => {
    const before = (enc: BufferEncoding, s?: number, e?: number) => big.toString(enc, s, e);
    const cases: Array<[BufferEncoding, number | undefined, number | undefined]> = [
      ['latin1', undefined, undefined],
      ['binary', 10, 20],
      ['latin1', -5, 4],
      ['latin1', 30, 10],
      ['binary', 0, big.length + 100],
      ['hex', 0, 64],
      ['utf8', 0, 64],
      ['base64', 3, 99],
    ];
    const expected = cases.map(([enc, s, e]) => before(enc, s, e));
    installFastLatin1();
    installFastLatin1(); // idempotent
    expect(cases.map(([enc, s, e]) => big.toString(enc, s, e))).toEqual(expected);
    expect(allBytes.toString('LATIN1' as BufferEncoding)).toBe(decodeLatin1(allBytes));
    expect(big.toString()).toBe(big.toString('utf8'));
  });
});
