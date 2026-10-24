import { PDFDocument } from 'pdf-lib';
import { detectPadesProfile, weakestProfile } from '../pades-profile';

/**
 * The B-B → B-LTA levels on real sealed bytes are asserted in the e2e
 * suites (`pades-tsa`, `sealing-hardening`, `multi-document-envelopes`),
 * next to `scripts/verify-pades.ts`. Here: what must never claim a level.
 */
describe('detectPadesProfile', () => {
  it('claims nothing for an unsigned PDF (a Noop seal)', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    const bytes = Buffer.from(await doc.save({ useObjectStreams: false }));
    expect(detectPadesProfile(bytes)).toEqual({ level: 'none', timestamped: false });
  });

  it('claims nothing when a CAdES signature is declared but its CMS does not parse', () => {
    const pdf = Buffer.from(
      '%PDF-1.7\n1 0 obj << /Type /Sig /SubFilter /ETSI.CAdES.detached ' +
        '/ByteRange [0 10 20 5] /Contents <00> >> endobj\n%%EOF\n',
      'latin1',
    );
    expect(detectPadesProfile(pdf)).toEqual({ level: 'none', timestamped: false });
  });

  it('does not take /DSS or /DocTimeStamp text as proof without a timestamped signature', () => {
    const pdf = Buffer.from(
      '%PDF-1.7\n<< /Type /DSS >>\n<< /Type /DocTimeStamp /SubFilter /ETSI.RFC3161 >>\n%%EOF\n',
      'latin1',
    );
    expect(detectPadesProfile(pdf).level).toBe('none');
  });
});

describe('weakestProfile', () => {
  it('keeps the lower level', () => {
    const lta = { level: 'B-LTA', timestamped: true } as const;
    const bb = { level: 'B-B', timestamped: false } as const;
    expect(weakestProfile(lta, bb)).toBe(bb);
    expect(weakestProfile(bb, lta)).toBe(bb);
  });
});
