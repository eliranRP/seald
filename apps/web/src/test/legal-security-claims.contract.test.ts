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
  '30-day grace',
  'can be restored',
  'Three (3) years',
  'longer of the period above',
  'record-retention under ESIGN',
  'U.S. surveillance-law assessment',
  'government-request transparency',
  'vetted',
  'security training',
  'deletes or returns all Personal Data',
  'family-law instruments (ESIGN § 7003(a)(1))',
  'utility services (ESIGN § 7003(b)(2)(B)(i))',
  'ESIGN § 7003(b)(2)(B)(ii)',
  'ESIGN § 7003(b)(2)(B)(iii)',
  'ESIGN § 7003(b)(2)(B)(iv)',
  'ESIGN § 7003(b)(2)(B)(v)',
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
    const withoutDenial = source.replace(/not an advanced[^.]*/gi, '');
    expect(withoutDenial).not.toMatch(/\bAdES\b/);
  });

  it('SECURITY.md scopes seal review to seals that were applied', () => {
    const source = readFileSync(resolve(__dirname, '../../../../SECURITY.md'), 'utf8');
    expect(source).toContain('PAdES seals when applied');
    expect(source).not.toContain('PAdES-LT');
  });

  it('privacy describes transit and provider encryption without a version or cipher', () => {
    const source = read(PAGES, 'privacy.astro');
    expect(source).toContain(
      'Data is encrypted with TLS in transit between your device and our services, and between our servers and our database, file-storage and email providers. Documents, signatures and audit records are stored with our database and file-storage provider, which encrypts them at rest.',
    );
    expect(source).toContain(
      "Until you delete your account. Deletion takes effect immediately and can't be undone. Your login, contacts, templates, drafts and Google Drive connection data, including saved tokens, are deleted. Envelopes you've sent, and their audit records, are kept without a link to your account, and your email address is removed from the signer records where it appears.",
    );
    expect(source).toContain(
      'Google Drive connection</strong> — if you connect Google Drive: your Google email address and account identifier, the access scope you granted, when you connected, last used and disconnected it, and a saved token that lets Seald reach the files you allow until you disconnect.',
    );
    expect(source).toContain(
      'Until you disconnect it or delete your account. When you disconnect, we ask Google to revoke our access and delete the saved token straight away. We keep the connected Google email address and the connection dates until you delete your account.',
    );
    expect(source).toContain(
      "We don't currently delete support correspondence on a schedule, and we don't promise to keep it for any particular period.",
    );
    expect(source).toContain('(e.g. responding to lawful requests from authorities)');
    expect(source).toContain(
      'Our API and PDF conversion servers run on Amazon Web Services in the United States. Where we use AWS Key Management Service for document-sealing or token-wrapping keys, those keys are also held by AWS in the United States. Transactional email is sent through Resend, Inc., a U.S. company (see our Sub-processors list).',
    );
    expect(source).not.toContain('us-east-1');
    expect(source).not.toContain('us-east-2');
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
      "Before termination, the Customer can export its data from the Service. When the Customer deletes its account, Seald deletes the Customer's contacts, templates and drafts, and keeps sent and completed envelopes and their audit records without a link to the Customer's account. Seald doesn't currently delete those records on a schedule.",
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
    expect(source).toContain('family-law instruments (ESIGN § 7003(a)(2))');
    expect(source).toContain('utility services (ESIGN § 7003(b)(2)(A))');
    expect(source).toContain('foreclosure, or eviction (ESIGN § 7003(b)(2)(B))');
    expect(source).toContain('life-insurance benefits (ESIGN § 7003(b)(2)(C))');
    expect(source).toContain('health or safety (ESIGN § 7003(b)(2)(D))');
    expect(source).toContain('similar substances (ESIGN § 7003(b)(3))');
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
