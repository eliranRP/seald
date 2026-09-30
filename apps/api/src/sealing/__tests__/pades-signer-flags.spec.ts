import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import forge from 'node-forge';
import { PDFDocument } from 'pdf-lib';
import type { AppEnv } from '../../config/env.schema';
import { NoopPadesSigner, P12PadesSigner } from '../pades-signer';

/**
 * `appliesCmsSeal` is a property of the signer, not an `instanceof` guess
 * in SealingService. These tests fail if Noop reports true or P12 reports
 * false, and if a P12 seal without a TSA reports a timestamp.
 */

function writeP12(dir: string, password: string): string {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 24 * 60 * 60 * 1000);
  cert.setSubject([{ name: 'commonName', value: 'P12 flag test' }]);
  cert.setIssuer([{ name: 'commonName', value: 'P12 flag test' }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password);
  const path = join(dir, 'signer.p12');
  writeFileSync(path, Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary'));
  return path;
}

async function onePagePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

describe('PAdES signer seal flags', () => {
  it('NoopPadesSigner applies no CMS seal and no timestamp', async () => {
    const signer = new NoopPadesSigner();
    const result = await signer.sign(Buffer.from('%PDF-1.4'));
    expect(signer.appliesCmsSeal).toBe(false);
    expect(result.timestampApplied).toBe(false);
    expect(result.pdf.toString()).toBe('%PDF-1.4');
  });

  it('P12PadesSigner applies a CMS seal and reports no timestamp without a TSA', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'p12-flag-'));
    const password = 'flag-test';
    const path = writeP12(dir, password);
    const signer = new P12PadesSigner(
      {
        PDF_SIGNING_LOCAL_P12_PATH: path,
        PDF_SIGNING_LOCAL_P12_PASS: password,
      } as AppEnv,
      null,
    );
    const pdf = await onePagePdf();
    const result = await signer.sign(pdf);
    expect(signer.appliesCmsSeal).toBe(true);
    expect(result.timestampApplied).toBe(false);
    expect(result.pdf.toString('latin1')).toMatch(/\/ETSI\.CAdES\.detached/);
  });
});
