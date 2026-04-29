/**
 * Tests for `appendArchiveTimestamp` (PAdES-B-LTA).
 *
 * Contract:
 *   1. Original B-LT bytes preserved byte-for-byte at the prefix.
 *   2. Output ends with %%EOF and contains a new /Sig field with
 *      /SubFilter /ETSI.RFC3161 and /Type /DocTimeStamp.
 *   3. /ByteRange covers everything except the placeholder /Contents.
 *   4. /Contents holds the bytes returned by tsa.timestamp().
 *   5. /AcroForm reference appended to the catalog (incremental update).
 *   6. Skips gracefully when TSA unavailable (returns input unchanged).
 *   7. Falls through gracefully on TSA round-trip failure.
 */

import { Buffer } from 'node:buffer';
import { appendArchiveTimestamp } from './archive-timestamp';
import type { TsaClient, TimestampResult } from './tsa-client';

/**
 * Hand-rolled minimal valid PDF — same fixture pattern as
 * dss-incremental-update.spec.ts. The B-LTA writer doesn't care about
 * a real /DSS being present; it only cares about a valid trailer +
 * catalog so we can chain a new revision.
 */
function buildMinimalBLtPdf(): Buffer {
  const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  const obj2 = '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';
  const obj3 =
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>\nendobj\n';
  const pre = header + obj1 + obj2 + obj3;
  const xrefOffset = Buffer.byteLength(pre, 'binary');
  const off1 = Buffer.byteLength(header, 'binary');
  const off2 = off1 + Buffer.byteLength(obj1, 'binary');
  const off3 = off2 + Buffer.byteLength(obj2, 'binary');
  const xref =
    'xref\n' +
    '0 4\n' +
    '0000000000 65535 f \n' +
    `${off1.toString().padStart(10, '0')} 00000 n \n` +
    `${off2.toString().padStart(10, '0')} 00000 n \n` +
    `${off3.toString().padStart(10, '0')} 00000 n \n`;
  const trailer = `trailer\n<< /Size 4 /Root 1 0 R /ID [<00><00>] >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pre + xref + trailer, 'binary');
}

/** Synthetic TST: a minimal DER ContentInfo (signedData OID). */
function syntheticTstDer(): Buffer {
  // SEQUENCE { OID 1.2.840.113549.1.7.2 ; [0] EXPLICIT { } }
  // Hand-built so we don't depend on node-forge here.
  return Buffer.from([
    0x30,
    0x12, // SEQUENCE, length 18
    0x06,
    0x09,
    0x2a,
    0x86,
    0x48,
    0x86,
    0xf7,
    0x0d,
    0x01,
    0x07,
    0x02, // OID id-signedData
    0xa0,
    0x05, // [0] EXPLICIT, length 5
    0x30,
    0x03,
    0x02,
    0x01,
    0x00, // SEQUENCE { INTEGER 0 } — placeholder body
  ]);
}

function makeFakeTsa(over: Partial<TsaClient> = {}): TsaClient {
  const tokenDer = syntheticTstDer();
  return {
    configured: true,
    timestamp: jest.fn(
      async (): Promise<TimestampResult> => ({
        tokenDer,
        genTime: '2026-04-29T12:00:00Z',
        tsaUrl: 'https://tsa.example/tsr',
        messageImprintSha256Hex: 'deadbeef',
      }),
    ),
    ...(over as object),
  } as unknown as TsaClient;
}

describe('appendArchiveTimestamp', () => {
  it('returns input verbatim when TSA is not configured', async () => {
    const input = buildMinimalBLtPdf();
    const tsa = { configured: false } as unknown as TsaClient;
    const out = await appendArchiveTimestamp({ pdfWithDss: input, tsa });
    expect(out.equals(input)).toBe(true);
  });

  it('preserves the original B-LT bytes verbatim at the prefix', async () => {
    const input = buildMinimalBLtPdf();
    const tsa = makeFakeTsa();
    const out = await appendArchiveTimestamp({ pdfWithDss: input, tsa });

    expect(out.length).toBeGreaterThan(input.length);
    expect(out.subarray(0, input.length).equals(input)).toBe(true);
  });

  it('writes a new /Sig field with /SubFilter /ETSI.RFC3161 and /Type /DocTimeStamp', async () => {
    const input = buildMinimalBLtPdf();
    const tsa = makeFakeTsa();
    const out = await appendArchiveTimestamp({ pdfWithDss: input, tsa });
    const text = out.toString('latin1');

    expect(text).toMatch(/\/Type\s+\/DocTimeStamp/);
    expect(text).toMatch(/\/SubFilter\s+\/ETSI\.RFC3161/);
    expect(text).toMatch(/\/ByteRange\s*\[\s*\d+\s+\d+\s+\d+\s+\d+\s*\]/);
    expect(text).toMatch(/\/Contents\s*<[0-9a-fA-F]+>/);
  });

  it('fills /ByteRange so it covers the whole file except /Contents', async () => {
    const input = buildMinimalBLtPdf();
    const tsa = makeFakeTsa();
    const out = await appendArchiveTimestamp({ pdfWithDss: input, tsa });
    const text = out.toString('latin1');

    const brMatch = /\/ByteRange\s*\[(\d+) +(\d+) +(\d+) +(\d+)\]/.exec(text);
    expect(brMatch).not.toBeNull();
    const a = Number(brMatch![1]);
    const b = Number(brMatch![2]);
    const c = Number(brMatch![3]);
    const d = Number(brMatch![4]);

    // a = 0; b = position of '<' opening /Contents; c = position right after '>'; d = remainder.
    expect(a).toBe(0);
    expect(b).toBeGreaterThan(input.length);
    // The /Contents '<' should sit at offset b in the output.
    expect(out[b]).toBe(0x3c); // '<'
    expect(out[c - 1]).toBe(0x3e); // '>'
    // Total covered = b + d, should equal output length minus the
    // /Contents bytes (which are c-b including both '<' and '>').
    expect(b + d).toBe(out.length - (c - b));
  });

  it('embeds the TSA token bytes as the leading /Contents hex', async () => {
    const input = buildMinimalBLtPdf();
    const tokenDer = syntheticTstDer();
    const tsa = makeFakeTsa();
    const out = await appendArchiveTimestamp({ pdfWithDss: input, tsa });
    const text = out.toString('latin1');

    const m = /\/Contents <([0-9a-fA-F]+)>/.exec(text);
    expect(m).not.toBeNull();
    const hex = m![1]!;
    // First 2 * tokenDer.length chars are the real TST; rest is '0' padding.
    const tokenHex = tokenDer.toString('hex');
    expect(hex.startsWith(tokenHex)).toBe(true);
    // Padding zeros at the tail.
    expect(/^0+$/.test(hex.slice(tokenHex.length))).toBe(true);
  });

  it('appends /AcroForm reference onto the catalog (incremental revision)', async () => {
    const input = buildMinimalBLtPdf();
    const tsa = makeFakeTsa();
    const out = await appendArchiveTimestamp({ pdfWithDss: input, tsa });
    const text = out.toString('latin1');

    // Last `1 0 obj` is the new catalog revision — must reference /AcroForm.
    const lastCatalog = text.lastIndexOf('1 0 obj');
    expect(lastCatalog).toBeGreaterThan(input.length); // a NEW revision was appended
    const catalogBody = text.slice(lastCatalog, text.indexOf('endobj', lastCatalog));
    expect(catalogBody).toMatch(/\/AcroForm\s+\d+\s+0\s+R/);
    // Original /Pages reference preserved.
    expect(catalogBody).toMatch(/\/Pages\s+2\s+0\s+R/);
  });

  it('falls through to the input PDF on TSA round-trip failure', async () => {
    const input = buildMinimalBLtPdf();
    const failingTsa = {
      configured: true,
      timestamp: jest.fn(async () => {
        throw new Error('tsa_all_failed: every endpoint down');
      }),
    } as unknown as TsaClient;
    const out = await appendArchiveTimestamp({ pdfWithDss: input, tsa: failingTsa });
    expect(out.equals(input)).toBe(true);
  });

  it('hashes the byte-range-covered bytes for the TSA messageImprint', async () => {
    const input = buildMinimalBLtPdf();
    const tsa = makeFakeTsa();
    const captured: { data: Buffer | null } = { data: null };
    (tsa.timestamp as jest.Mock).mockImplementationOnce(async (data: Buffer) => {
      captured.data = Buffer.from(data); // copy
      return {
        tokenDer: syntheticTstDer(),
        genTime: '',
        tsaUrl: '',
        messageImprintSha256Hex: '',
      };
    });
    await appendArchiveTimestamp({ pdfWithDss: input, tsa });
    expect(captured.data).not.toBeNull();
    // SHA-256 digest is 32 bytes.
    expect(captured.data!.length).toBe(32);
  });

  it('produces a single trailer dict with /Prev pointing at the prior xref', async () => {
    const input = buildMinimalBLtPdf();
    const tsa = makeFakeTsa();
    const out = await appendArchiveTimestamp({ pdfWithDss: input, tsa });
    const text = out.toString('latin1');

    const trailerCount = (text.match(/(?:^|\n)trailer\s*<</g) ?? []).length;
    expect(trailerCount).toBe(2); // original + new
    const lastTrailer = text.slice(text.lastIndexOf('trailer'));
    expect(lastTrailer).toMatch(/\/Prev\s+\d+/);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  });
});
