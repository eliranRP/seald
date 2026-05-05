/**
 * Tests for `appendDssIncrementalUpdate`. The contract:
 *
 *   1. Original PDF bytes are byte-identical at the prefix → existing
 *      PAdES B-T signatures stay valid (/ByteRange unaffected).
 *   2. The output is a valid PDF: starts with `%PDF-`, ends with `%%EOF`,
 *      has one trailer with `/Prev` pointing at the prior xref offset.
 *   3. The catalog gains a /DSS entry referencing an indirect dict.
 *   4. /DSS contains /Certs, /OCSPs, /CRLs arrays of indirect refs to
 *      stream objects whose contents match the inputs byte-for-byte.
 */

import { Buffer } from 'node:buffer';
import { appendDssIncrementalUpdate } from '../dss-incremental-update';

/**
 * Build a minimal valid 4-object PDF: catalog -> pages -> page -> font.
 * Hand-rolled so the test harness has zero external deps and we can
 * assert exact byte-level invariants. The xref offset is computed
 * dynamically so the trailer line numbers match.
 */
function buildMinimalPdf(): Buffer {
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

describe('appendDssIncrementalUpdate', () => {
  it('preserves original bytes verbatim (incremental update contract)', () => {
    const original = buildMinimalPdf();
    const certBytes = Buffer.from('CERT-FAKE-DER-BYTES');
    const out = appendDssIncrementalUpdate({
      originalPdf: original,
      certs: [certBytes],
      ocsps: [],
      crls: [],
    });
    expect(out.length).toBeGreaterThan(original.length);
    // Original prefix is byte-identical — this is THE invariant that
    // keeps the pre-existing PAdES signature valid.
    expect(out.subarray(0, original.length).equals(original)).toBe(true);
  });

  it('appends a new xref + trailer with /Prev pointing at the prior xref', () => {
    const original = buildMinimalPdf();
    const out = appendDssIncrementalUpdate({
      originalPdf: original,
      certs: [Buffer.from('A')],
      ocsps: [Buffer.from('B')],
      crls: [Buffer.from('C')],
    });
    const text = out.toString('latin1');
    // Exactly two xref sections (one prior, one new).
    const xrefCount = (text.match(/(?:^|\n)xref\n/g) ?? []).length;
    expect(xrefCount).toBe(2);
    // Two trailer dicts as well.
    const trailerCount = (text.match(/(?:^|\n)trailer\s*<</g) ?? []).length;
    expect(trailerCount).toBe(2);
    // Output ends with %%EOF.
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    // The new trailer carries /Prev with the original xref offset.
    const lastTrailer = text.lastIndexOf('trailer');
    const trailerSlice = text.slice(lastTrailer);
    expect(/\/Prev\s+\d+/.test(trailerSlice)).toBe(true);
  });

  it('writes a /DSS reference onto the catalog with /Certs /OCSPs /CRLs arrays', () => {
    const original = buildMinimalPdf();
    const certs = [Buffer.from('CERT-A'), Buffer.from('CERT-B')];
    const ocsps = [Buffer.from('OCSP-1')];
    const crls = [Buffer.from('CRL-X')];
    const out = appendDssIncrementalUpdate({
      originalPdf: original,
      certs,
      ocsps,
      crls,
    });
    const text = out.toString('latin1');

    // /DSS entry appended onto the catalog (object 1).
    const lastCatalogIdx = text.lastIndexOf('1 0 obj');
    expect(lastCatalogIdx).toBeGreaterThan(original.length); // a NEW revision was appended
    const catalogBody = text.slice(lastCatalogIdx, text.indexOf('endobj', lastCatalogIdx));
    expect(catalogBody).toMatch(/\/DSS\s+\d+\s+0\s+R/);

    // /DSS dict has /Certs (2 refs), /OCSPs (1 ref), /CRLs (1 ref).
    expect(text).toMatch(/\/Type\s+\/DSS/);
    expect(text).toMatch(/\/Certs\s+\[\s*\d+\s+0\s+R\s+\d+\s+0\s+R\s*\]/);
    expect(text).toMatch(/\/OCSPs\s+\[\s*\d+\s+0\s+R\s*\]/);
    expect(text).toMatch(/\/CRLs\s+\[\s*\d+\s+0\s+R\s*\]/);
  });

  it('embeds cert / OCSP / CRL bytes verbatim as PDF stream objects', () => {
    const original = buildMinimalPdf();
    const cert = Buffer.from([0x30, 0x82, 0x01, 0x02, 0x03, 0x04]); // looks like DER
    const out = appendDssIncrementalUpdate({
      originalPdf: original,
      certs: [cert],
      ocsps: [],
      crls: [],
    });
    // Find the stream we wrote and confirm its bytes are the input.
    const streamMarker = Buffer.from('\nstream\n', 'binary');
    const streamStart = out.indexOf(streamMarker);
    expect(streamStart).toBeGreaterThan(0);
    const contentStart = streamStart + streamMarker.length;
    const recovered = out.subarray(contentStart, contentStart + cert.length);
    expect(recovered.equals(cert)).toBe(true);
  });

  it('returns the original verbatim when there is nothing to embed', () => {
    const original = buildMinimalPdf();
    const out = appendDssIncrementalUpdate({
      originalPdf: original,
      certs: [],
      ocsps: [],
      crls: [],
    });
    expect(out.equals(original)).toBe(true);
  });

  it("preserves the catalog's pre-existing entries (e.g. /Pages)", () => {
    const original = buildMinimalPdf();
    const out = appendDssIncrementalUpdate({
      originalPdf: original,
      certs: [Buffer.from('X')],
      ocsps: [],
      crls: [],
    });
    const text = out.toString('latin1');
    const lastCatalogIdx = text.lastIndexOf('1 0 obj');
    const catalogBody = text.slice(lastCatalogIdx, text.indexOf('endobj', lastCatalogIdx));
    // The original catalog had /Pages 2 0 R — that must survive.
    expect(catalogBody).toMatch(/\/Pages\s+2\s+0\s+R/);
    expect(catalogBody).toMatch(/\/Type\s+\/Catalog/);
  });

  it('preserves /ID across the incremental update (PDF 1.7 §14.4)', () => {
    const original = buildMinimalPdf();
    const out = appendDssIncrementalUpdate({
      originalPdf: original,
      certs: [Buffer.from('X')],
      ocsps: [],
      crls: [],
    });
    const text = out.toString('latin1');
    const lastTrailer = text.slice(text.lastIndexOf('trailer'));
    expect(lastTrailer).toMatch(/\/ID\s*\[<00><00>\]/);
  });
});
