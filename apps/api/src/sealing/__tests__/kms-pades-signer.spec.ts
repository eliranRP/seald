/**
 * Tests for `KmsPadesSigner` — verifies the placeholder + SignPdf
 * pipeline produces a valid PDF whose embedded /Contents byte range
 * holds the CMS SignedData built by KmsCmsSigner.
 *
 * The CMS construction itself is exhaustively unit-tested in
 * kms-cms-signer.spec.ts; here we only assert the integration: a real
 * input PDF round-trips through the full path and gains a /Sig entry
 * with /SubFilter /ETSI.CAdES.detached.
 *
 * We mock the AWS SDK at the module level so no AWS creds are needed
 * to run these tests.
 */

import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import forge from 'node:crypto';
import nodeForge from 'node-forge';
import { PDFDocument } from 'pdf-lib';
import type { AppEnv } from '../../config/env.schema';

// AWS SDK is heavy and requires no real network calls in unit tests —
// stub it out at module scope so KmsPadesSigner constructs cleanly.
const sendMock = jest.fn();
jest.mock('@aws-sdk/client-kms', () => ({
  KMSClient: jest.fn().mockImplementation(() => ({ send: sendMock })),
  SignCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
}));

import { KmsPadesSigner } from '../pades-signer';

/** Build a self-signed cert + matching private key (forge). */
function makeCertAndKey(): {
  cert: nodeForge.pki.Certificate;
  key: nodeForge.pki.rsa.PrivateKey;
  pem: string;
} {
  const keys = nodeForge.pki.rsa.generateKeyPair(2048);
  const cert = nodeForge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 1);
  cert.setSubject([{ name: 'commonName', value: 'KMS PAdES Test' }]);
  cert.setIssuer([{ name: 'commonName', value: 'KMS PAdES Test' }]);
  cert.sign(keys.privateKey, nodeForge.md.sha256.create());
  return { cert, key: keys.privateKey, pem: nodeForge.pki.certificateToPem(cert) };
}

async function buildSamplePdf(): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  page.drawText('Seald sample PDF', { x: 50, y: 700 });
  // Classic xref — @signpdf/placeholder-plain can't parse compressed
  // object streams (matches the convention in test/pades-signing.e2e-spec.ts).
  const bytes = await pdfDoc.save({ useObjectStreams: false });
  return Buffer.from(bytes);
}

function envWith(over: Partial<AppEnv>): AppEnv {
  return { ...({} as AppEnv), ...over };
}

describe('KmsPadesSigner', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('produces a signed PDF that contains a /SubFilter /ETSI.CAdES.detached entry', async () => {
    const { key, pem } = makeCertAndKey();

    // Wire the stub so KMS Sign returns a real RSA signature over the
    // digest provided. KmsCmsSigner expects MessageType=DIGEST.
    sendMock.mockImplementation(async (cmd: { input: { Message: Uint8Array } }) => {
      const md = nodeForge.md.sha256.create();
      md.digest = () =>
        nodeForge.util.createBuffer(Buffer.from(cmd.input.Message).toString('binary'));
      const signature = key.sign(md);
      return { Signature: Buffer.from(signature, 'binary') };
    });

    const env = envWith({
      PDF_SIGNING_KMS_KEY_ID: 'arn:aws:kms:us-east-1:1:key/abc',
      PDF_SIGNING_KMS_REGION: 'us-east-1',
      PDF_SIGNING_KMS_CERT_PEM: pem,
    });
    const signer = new KmsPadesSigner(env, null);

    const pdf = await buildSamplePdf();
    const signed = await signer.sign(pdf);

    expect(signed).toBeInstanceOf(Buffer);
    expect(signed.length).toBeGreaterThan(pdf.length);

    const text = signed.toString('latin1');
    // The placeholder writes /SubFilter /ETSI.CAdES.detached — this is
    // the marker EU DSS / Adobe Reader use to attempt PAdES validation.
    expect(text).toMatch(/\/SubFilter\s*\/ETSI\.CAdES\.detached/);
    expect(text).toMatch(/\/ByteRange\s*\[/);
    expect(sendMock).toHaveBeenCalledTimes(1);
    // Avoid unused import warnings — `forge` (node:crypto) is referenced
    // for hash parity with KmsCmsSigner internals if a future test extends.
    void forge;
    void writeFileSync;
    void tmpdir;
    void join;
  });

  it('throws when KMS env vars are missing', () => {
    const env = envWith({
      PDF_SIGNING_KMS_KEY_ID: undefined,
      PDF_SIGNING_KMS_REGION: undefined,
    });
    expect(() => new KmsPadesSigner(env, null)).toThrow(/PDF_SIGNING_KMS_KEY_ID/);
  });

  it('throws when neither inline PEM nor PEM path is provided', () => {
    const env = envWith({
      PDF_SIGNING_KMS_KEY_ID: 'k',
      PDF_SIGNING_KMS_REGION: 'us-east-1',
    });
    expect(() => new KmsPadesSigner(env, null)).toThrow(/PDF_SIGNING_KMS_CERT_PEM/);
  });
});
