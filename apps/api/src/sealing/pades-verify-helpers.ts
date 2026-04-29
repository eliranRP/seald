/**
 * Helpers for the PAdES verifier (F-13). Extracted from the script
 * (`apps/api/scripts/verify-pades.ts`) so they live where Jest can
 * find them and the parsing edge cases get unit-test coverage.
 *
 * Why these aren't in @signpdf/utils
 * -----------------------------------
 * @signpdf/utils.extractSignature strips trailing `00` byte pairs from
 * the hex blob before decoding (the `.replace(/(?:00|>)+$/, '')` line
 * inside its source). That logic chops legitimate DER content whose
 * terminal byte happens to be 0x00 — common for INTEGERs with the high
 * bit set and for OCTET STRING payloads ending in a zero byte. The
 * result is a CMS that fails ASN.1 parsing because the outer SEQUENCE
 * length runs one byte past the (now truncated) buffer.
 *
 * `extractCmsFromPdf` reads /ByteRange + /Contents directly without
 * trimming, returning the full /Contents payload (including any
 * placeholder zero padding). `sliceDerSequence` then walks the X.690
 * length encoding to identify exactly the real-CMS prefix; bytes past
 * the SEQUENCE end are placeholder padding by definition.
 */

/**
 * Locate /ByteRange + /Contents in the PDF and return the hex-decoded
 * /Contents bytes (raw, including any trailing zero padding) plus the
 * concatenation of the two byte-range segments that the CMS messageDigest
 * is supposed to cover.
 *
 * Intentionally minimal — no support for multiple signatures or for
 * compressed object streams (our sealing pipeline produces neither).
 */
export function extractCmsFromPdf(pdf: Buffer): {
  contentsHexDecoded: Buffer;
  signedRange: Buffer;
} {
  const text = pdf.toString('latin1');
  const brMatch = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(text);
  if (!brMatch) {
    throw new Error('/ByteRange not found');
  }
  const a = Number(brMatch[1]);
  const b = Number(brMatch[2]);
  const c = Number(brMatch[3]);
  const d = Number(brMatch[4]);
  const signedRange = Buffer.concat([pdf.subarray(a, a + b), pdf.subarray(c, c + d)]);

  // /Contents starts at offset (a + b), opens with `<` and closes with `>`.
  // The bytes between are uppercase or lowercase hex.
  const contentsStart = a + b;
  const contentsEnd = c;
  if (
    contentsStart < 0 ||
    contentsEnd > pdf.length ||
    contentsStart >= contentsEnd ||
    pdf[contentsStart] !== 0x3c // '<'
  ) {
    throw new Error('/Contents marker not found at /ByteRange gap');
  }
  // Exclude the leading '<' and trailing '>'.
  const hex = pdf.subarray(contentsStart + 1, contentsEnd - 1).toString('latin1');
  const contentsHexDecoded = Buffer.from(hex, 'hex');
  return { contentsHexDecoded, signedRange };
}

/**
 * Read the X.690 DER length octets at offset 1 (after the tag byte) and
 * return the slice spanning exactly the outer SEQUENCE — header + content.
 * Anything past the end is /Contents zero padding from the placeholder.
 *
 * Throws if the buffer doesn't start with a SEQUENCE (0x30) or the
 * declared length runs past the buffer.
 */
export function sliceDerSequence(raw: Buffer): Buffer {
  if (raw.length < 2 || raw[0] !== 0x30) {
    throw new Error('CMS does not start with a SEQUENCE tag (0x30)');
  }
  const lenByte = raw[1]!;
  let headerLen: number;
  let contentLen: number;
  if (lenByte < 0x80) {
    // Short form: length fits in one byte.
    headerLen = 2;
    contentLen = lenByte;
  } else {
    // Long form: low 7 bits = number of length octets that follow.
    const numLenOctets = lenByte & 0x7f;
    if (numLenOctets === 0 || numLenOctets > 4) {
      // Indefinite (0) is illegal in DER; >4 would imply a > 4 GB CMS.
      throw new Error(`unsupported DER length encoding (${numLenOctets} octets)`);
    }
    headerLen = 2 + numLenOctets;
    contentLen = 0;
    for (let i = 0; i < numLenOctets; i++) {
      contentLen = (contentLen << 8) | raw[2 + i]!;
    }
  }
  const total = headerLen + contentLen;
  if (total > raw.length) {
    throw new Error(`declared CMS length (${total}) exceeds extracted buffer (${raw.length})`);
  }
  return raw.subarray(0, total);
}
