import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Security and retention sentences on every public legal page. Cipher
 * names, a TLS version, a long-term validation profile, and a fixed
 * retention period are not enforced by Caddy, the Dockerfile, the
 * storage client, or any deletion job.
 */
const LANDING_LEGAL = resolve(__dirname, '../../../landing/src/pages/legal');

const PAGES = readdirSync(LANDING_LEGAL)
  .filter((name) => name.endsWith('.astro'))
  .sort();

const RETIRED_CLAIMS = [
  'AES-256',
  'TLS 1.3',
  'PAdES-LT',
  'PAdES-LTV',
  'Retained 7 years',
  'seven (7) years',
  'Seven (7) years',
  '7 years',
  'long-term-validation',
  'long-term validation',
  'ETSI EN 319 142',
  'Advanced Electronic Signature',
] as const;

describe('legal page security claims', () => {
  it('covers every page under apps/landing/src/pages/legal', () => {
    expect(PAGES).toEqual([
      'accessibility.astro',
      'aup.astro',
      'cookies.astro',
      'dpa.astro',
      'esign-disclosure.astro',
      'imprint.astro',
      'privacy.astro',
      'responsible-disclosure.astro',
      'sub-processors.astro',
      'terms.astro',
    ]);
  });

  it.each(PAGES)('%s drops cipher, TLS version, PAdES-LT, and retention-period claims', (file) => {
    const source = readFileSync(resolve(LANDING_LEGAL, file), 'utf8');
    for (const claim of RETIRED_CLAIMS) {
      expect(source).not.toContain(claim);
    }
  });

  it('privacy describes transit and provider encryption without a version or cipher', () => {
    const source = read(PAGES, 'privacy.astro');
    expect(source).toContain(
      'Data is encrypted with TLS in transit between your device and our services, and between our servers and our database, file-storage and email providers. Documents, signatures and audit records are stored with our database and file-storage provider, which encrypts them at rest.',
    );
  });

  it('terms describe only verifiable controls', () => {
    const source = read(PAGES, 'terms.astro');
    expect(source).toContain(
      'Seald describes its security posture solely in terms of verifiable controls: TLS encryption in transit between your device and our services and between our servers and our database, file-storage and email providers; encryption at rest of stored documents, signatures and audit records by our database and file-storage provider; a PAdES seal when applied; an RFC 3161 timestamp when available; and a SHA-256 hash chain over audit events.',
    );
    expect(source).toContain(
      'Seald records a simple electronic signature. It is not an advanced or qualified electronic signature.',
    );
  });

  it('the DPA limits encryption, key management, and backups to what the service does', () => {
    const source = read(PAGES, 'dpa.astro');
    expect(source).toContain(
      "TLS in transit between users and the Service, and between Seald's servers and its database, file-storage and email Sub-processors. Traffic between software components on the same server (the reverse proxy, the API and the document-conversion service) isn't separately encrypted. Data stored by Seald's database and file-storage Sub-processor is encrypted at rest by that Sub-processor.",
    );
    expect(source).toContain(
      "Supplementary technical and organizational measures for these transfers: TLS encryption in transit between users and the Service and between Seald's servers and its Sub-processors, encryption at rest by Seald's database and file-storage Sub-processor, U.S. surveillance-law assessment, government-request transparency.",
    );
    expect(source).toContain(
      'Where Seald uses AWS Key Management Service (KMS) for document-sealing or Google Drive token-wrapping keys, the key material is non-exportable from KMS.',
    );
    expect(source).toContain(
      "Seald doesn't currently keep separate backups of Customer Personal Data. Data lost from the primary database or file storage may not be recoverable.",
    );
  });

  it('the acceptable use policy matches the simple-signature disclosure', () => {
    const source = read(PAGES, 'aup.astro');
    expect(source).toContain(
      'Seald records a simple electronic signature. It is not an advanced or qualified electronic signature.',
    );
  });

  it('responsible disclosure scopes seal review to seals that were applied', () => {
    const source = read(PAGES, 'responsible-disclosure.astro');
    expect(source).toContain('PAdES seals issued by the Service (when applied)');
  });
});

function read(pages: readonly string[], file: string): string {
  expect(pages).toContain(file);
  return readFileSync(resolve(LANDING_LEGAL, file), 'utf8');
}
