/**
 * Unit coverage for the PAdES verifier helpers (F-13). Pinned by the
 * regression that motivated extracting them from @signpdf/utils:
 * trailing 0x00 bytes inside legitimate DER content must NOT be
 * trimmed, and the outer SEQUENCE length is the authoritative cutoff
 * between real CMS and /Contents zero-padding.
 */

import { Buffer } from 'node:buffer';
import { extractCmsFromPdf, sliceDerSequence } from './pades-verify-helpers';

describe('sliceDerSequence', () => {
  it('honours short-form length and ignores trailing padding', () => {
    // SEQUENCE { OCTET STRING(3) "abc" } = 30 05 04 03 61 62 63
    const cms = Buffer.from('30050403616263', 'hex');
    const padded = Buffer.concat([cms, Buffer.alloc(100, 0x00)]);
    expect(sliceDerSequence(padded).equals(cms)).toBe(true);
  });

  it('preserves a legitimate trailing 0x00 byte inside the SEQUENCE', () => {
    // SEQUENCE { INTEGER(4) 7fff fe00 } = 30 06 02 04 7f ff fe 00.
    // The terminal 0x00 is real DER content and the @signpdf/utils
    // trim would chop it — sliceDerSequence must NOT.
    const cms = Buffer.from('30060204' + '7ffffe00', 'hex');
    const padded = Buffer.concat([cms, Buffer.alloc(50, 0x00)]);
    const out = sliceDerSequence(padded);
    expect(out.length).toBe(8);
    expect(out[7]).toBe(0x00);
    expect(out.equals(cms)).toBe(true);
  });

  it('honours long-form length encoding (0x82, 2 length octets)', () => {
    // SEQUENCE { 300 bytes }: 30 82 01 2c <300 bytes>.
    const content = Buffer.alloc(300, 0x42);
    const header = Buffer.from('3082012c', 'hex');
    const cms = Buffer.concat([header, content]);
    const padded = Buffer.concat([cms, Buffer.alloc(20, 0x00)]);
    expect(sliceDerSequence(padded).equals(cms)).toBe(true);
  });

  it('throws when the buffer does not start with a SEQUENCE tag', () => {
    expect(() => sliceDerSequence(Buffer.from([0x02, 0x01, 0x05]))).toThrow(/SEQUENCE tag/);
  });

  it('throws when the declared length runs past the buffer', () => {
    // SEQUENCE { 100 bytes }: 30 64 ... but only 2 bytes of content.
    const truncated = Buffer.concat([Buffer.from('3064', 'hex'), Buffer.alloc(2)]);
    expect(() => sliceDerSequence(truncated)).toThrow(/exceeds extracted buffer/);
  });

  it('rejects indefinite-length encoding (illegal in DER)', () => {
    // 30 80 = SEQUENCE, indefinite length — BER-only, not allowed in DER.
    const indef = Buffer.from('3080', 'hex');
    expect(() => sliceDerSequence(indef)).toThrow(/unsupported DER length/);
  });
});

describe('extractCmsFromPdf', () => {
  /**
   * Build a synthetic PDF whose /ByteRange + /Contents skeleton is just
   * enough for the extractor. The signedRange bytes are arbitrary but
   * fixed so the test can assert exact recovery.
   *
   * Layout:
   *   [0 .. b)  →  first byte-range segment (header + everything up to
   *                /Contents value)
   *   [b .. c)  →  /Contents <hex...> (with potential zero padding)
   *   [c .. c+d)→ second byte-range segment (everything after /Contents)
   */
  function buildSyntheticPdf(
    cmsHex: string,
    reservedHexLen: number,
  ): { pdf: Buffer; signedRangeBytes: Buffer } {
    const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n/Sig << /ByteRange [';
    // Pad placeholders to fixed widths so /ByteRange numbers don't shift
    // when we substitute real values.
    const placeholderRange = '0000000000 0000000000 0000000000 0000000000';
    const sigOpen = `${placeholderRange}] /Contents `;
    const trailer = '\n>> endobj\n';

    const cms = `<${cmsHex.padEnd(reservedHexLen, '0')}>`;

    const a = 0;
    const b = (header + sigOpen).length;
    const c = b + cms.length;
    const d = trailer.length;

    const realRange = `${String(a).padStart(10, '0')} ${String(b).padStart(10, '0')} ${String(c).padStart(10, '0')} ${String(d).padStart(10, '0')}`;
    const finalText = header + `${realRange}] /Contents ` + cms + trailer;

    return {
      pdf: Buffer.from(finalText, 'latin1'),
      signedRangeBytes: Buffer.concat([
        Buffer.from(finalText.slice(a, a + b), 'latin1'),
        Buffer.from(finalText.slice(c, c + d), 'latin1'),
      ]),
    };
  }

  it('decodes /Contents hex (zero-padded) without trimming legitimate trailing zeros', () => {
    // The CMS prefix legitimately ends in 0x00. The @signpdf/utils
    // extract would chop it; ours must not.
    const cmsHex = '30060204' + '7ffffe00';
    const { pdf } = buildSyntheticPdf(cmsHex, 200);
    const { contentsHexDecoded } = extractCmsFromPdf(pdf);

    // First 8 bytes are the real CMS; rest is placeholder padding.
    const real = contentsHexDecoded.subarray(0, 8);
    expect(real.toString('hex')).toBe(cmsHex);
    // Buffer carries the full padded length (200 hex chars / 2 = 100 bytes).
    expect(contentsHexDecoded.length).toBe(100);
  });

  it('reconstructs the byte-range concatenation that messageDigest covers', () => {
    const cmsHex = '300506030101ff'; // 7 bytes of CMS
    const { pdf, signedRangeBytes } = buildSyntheticPdf(cmsHex, 100);
    const { signedRange } = extractCmsFromPdf(pdf);
    expect(signedRange.equals(signedRangeBytes)).toBe(true);
  });

  it('throws when /ByteRange is absent', () => {
    const fake = Buffer.from('not a pdf', 'latin1');
    expect(() => extractCmsFromPdf(fake)).toThrow(/ByteRange not found/);
  });

  it('round-trips: extract → slice → expected real CMS bytes', () => {
    const cmsHex = '30060204' + '7ffffe00';
    const { pdf } = buildSyntheticPdf(cmsHex, 400);
    const { contentsHexDecoded } = extractCmsFromPdf(pdf);
    const sliced = sliceDerSequence(contentsHexDecoded);
    expect(sliced.toString('hex')).toBe(cmsHex);
  });
});
