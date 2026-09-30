import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Envelope, EnvelopeEvent } from '../../envelopes/envelope.entity';
import type { SignerAuditDetail } from '../../envelopes/envelopes.repository';
import { buildAuditPdf } from '../audit-pdf';

const nodeRequire = createRequire(__filename);
const GDRIVE_KMS_SERVICE = resolve(__dirname, '../../integrations/gdrive/gdrive-kms.service.ts');

/**
 * Claims the certificate used to print as facts. A noop signer applies
 * no CMS seal, a timestamp is best-effort, and nothing deletes sealed
 * files on a timer. `cmsSealApplied` distinguishes a recorded hash from
 * a CMS seal so a completed noop envelope is not described as sealed.
 */
const RETIRED_RENDERED_CLAIMS = [
  'Seald, Inc.',
  'Retained for',
  'Retained 7 years',
  'PAdES-LT',
  'PAdES-LTV',
  'AES-256',
  'TLS 1.3',
  'RFC 3161 trusted',
  'Enabled · RFC 3161',
  'Encrypted at rest',
  'Retrieved on verification only',
  'original file',
  'Access code',
  'ID verification',
  'Advanced Electronic',
] as const;

const RETIRED_SOURCE_CLAIMS = [
  'Seald, Inc.',
  'Retained 7 years',
  'PAdES-LT',
  'PAdES-LTV',
  'AES-256',
  'TLS 1.3',
  '7 years',
] as const;

const COVER_LINE = 'Seald · PAdES seal when applied · RFC 3161 timestamp when available';
const SEALED_SIGNATURE_ROW = 'Sealed · PAdES seal when applied · RFC 3161 timestamp when available';
const UNSEALED_REQUEST_ID =
  'The unique reference number of this request. With this ID, anyone can look up the request on seald.nromomentum.com/verify, check the audit chain, and obtain this audit trail.';

describe('audit PDF rendered claims', () => {
  let sealedText = '';
  let unsealedText = '';
  let noopText = '';
  let noTimestampText = '';

  beforeAll(async () => {
    const sealed = await buildAuditPdf(makeInput({ sealed: true, senderName: null }));
    const unsealed = await buildAuditPdf(makeInput({ sealed: false, senderName: 'Sam Guest' }));
    const noop = await buildAuditPdf(
      makeInput({ sealed: true, senderName: null, cmsSealApplied: false }),
    );
    const noTimestamp = await buildAuditPdf(
      makeInput({ sealed: true, senderName: null, timestampApplied: false }),
    );
    sealedText = normalizePdfText(extractPdfText(sealed));
    unsealedText = normalizePdfText(extractPdfText(unsealed));
    noopText = normalizePdfText(extractPdfText(noop));
    noTimestampText = normalizePdfText(extractPdfText(noTimestamp));
  }, 120_000);

  it('states Legal’s conditional seal, timestamp, and storage wording', () => {
    for (const text of [sealedText, unsealedText]) {
      expect(text).toContain(COVER_LINE);
      expect(text).toContain('RFC 3161 when available');
      expect(text).toContain('Added by an external timestamp authority when it responds.');
      expect(text).toContain('Access-controlled');
      expect(text).toContain('Stored with our file-storage provider, which encrypts it at rest.');
      expect(text).toContain(
        'A PAdES digital seal that Seald adds to the completed PDF when a seal is applied.',
      );
      expect(text).toContain('The seal identifies Seald as the sealer, not the signer.');
      expect(text).toContain('How the signer was identified:');
      expect(text).toContain('The signer opened a unique link sent to their email address.');
      expect(text).toContain('When present, a technological instrument');
      for (const claim of RETIRED_RENDERED_CLAIMS) {
        expect(text).not.toContain(claim);
      }
    }
  });

  it('uses the sealed datagrid row only when a sealed hash is present', () => {
    expect(sealedText).toContain(SEALED_SIGNATURE_ROW);
    expect(sealedText).not.toContain('Not applicable (unsealed)');
    expect(unsealedText).toContain('Not applicable (unsealed)');
    expect(unsealedText).not.toContain(SEALED_SIGNATURE_ROW);
  });

  it('does not describe an unsealed file as sealed or verified', () => {
    expect(sealedText).toContain('This document is sealed');
    expect(sealedText).toContain('SHA-256 hash matches the sealed document.');
    expect(unsealedText).toContain('This document is not sealed');
    expect(unsealedText).not.toContain('This document is sealed');
    expect(unsealedText.replace(/\s+/g, '')).toContain('NOTSEALED');
    expect(unsealedText).toContain('Declined');
    expect(unsealedText).toContain('There is no sealed document for this request.');
    expect(unsealedText).not.toContain('since it was sealed');
    expect(unsealedText).not.toContain('SHA-256 hash matches the sealed document.');
    expect(unsealedText).toContain('SHA-256 links each audit event to the one before it.');
    expect(unsealedText).not.toContain('Verified via account authentication');
    expect(unsealedText).toContain('Email address entered by the sender');
    expect(sealedText).toContain('Account authentication when the sender was signed in');
    expect(sealedText).not.toContain('Verified via account authentication');
    expect(sealedText).toContain('From created to sealed.');
    expect(sealedText).toContain('the sealed file');
    expect(sealedText).toContain(
      'The unique reference number of the sealed document. With this ID, anyone can look up the document on seald.nromomentum.com/verify, validate its authenticity, and obtain the audit trail and the sealed file.',
    );
    expect(sealedText).not.toContain(UNSEALED_REQUEST_ID);
    expect(unsealedText).toContain('From created to the last event.');
    expect(unsealedText).not.toContain('the sealed file');
    expect(unsealedText).not.toContain('reference number of the sealed document');
    expect(unsealedText).toContain(UNSEALED_REQUEST_ID);
    expect(unsealedText).toContain('This audit trail details specific information');
    expect(unsealedText).toContain('This file has no digital seal.');
  });

  it('does not call a completed noop-signer file sealed or verified', () => {
    expect(noopText).toContain('not sealed');
    expect(noopText).not.toContain('Verified');
    expect(noopText).not.toContain('VERIFIED');
    expect(noopText).toContain('Hash recorded');
    expect(noopText).toContain(
      'SHA-256 of the completed file is recorded. The file has no digital seal.',
    );
    expect(noopText).toContain(
      'If this audit trail is printed, scan the code or type the URL below to compare the file with its recorded SHA-256 hash. This file has no digital seal.',
    );
    // JetBrains Mono extracts "g" as ")" ("di)ital"), so match the g-free prefix.
    expect(noopText).toContain('Not applied');
    expect(noopText).not.toContain('This document is sealed');
    expect(noopText).not.toContain('SHA-256 hash matches the sealed document.');
    expect(noopText).toContain('From created to completed.');
    expect(noopText).not.toContain('created to sealed');
    expect(noopText).not.toContain('the sealed file');
    expect(noopText).not.toContain('reference number of the sealed document');
    expect(noopText).toContain(UNSEALED_REQUEST_ID);
    expect(noopText).toContain('This file has no digital seal.');
  });

  it('says a real seal has no timestamp when the TSA did not embed one', () => {
    expect(noTimestampText).toContain('This document is sealed');
    expect(noTimestampText).toContain('Sealed · no timestamp');
    expect(noTimestampText).toContain('No timestamp');
    expect(noTimestampText).toContain('The seal was applied without an RFC 3161 timestamp.');
    expect(noTimestampText).not.toContain(SEALED_SIGNATURE_ROW);
    expect(noTimestampText).not.toContain('RFC 3161 when available');
    expect(noTimestampText).toContain('From created to sealed.');
  });
});

describe('API source and email templates', () => {
  it('does not hard-code retired entity, retention, cipher, or PAdES-LT claims', () => {
    const files = collectSources(resolve(__dirname, '../..'));
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const claim of RETIRED_SOURCE_CLAIMS) {
        if (claim === 'AES-256' && file === GDRIVE_KMS_SERVICE) continue;
        if (text.includes(claim)) hits.push(`${file}: ${claim}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

function makeInput(opts: {
  sealed: boolean;
  senderName: string | null;
  cmsSealApplied?: boolean;
  timestampApplied?: boolean;
}): {
  envelope: Envelope;
  events: ReadonlyArray<EnvelopeEvent>;
  signerDetails: ReadonlyArray<SignerAuditDetail>;
  sealedSha256: string | null;
  sealedPages: number | null;
  cmsSealApplied: boolean;
  timestampApplied: boolean;
  publicUrl: string;
} {
  const envelopeId = '11111111-1111-4111-8111-111111111111';
  const signerId = '22222222-2222-4222-8222-222222222222';
  const sealedSha256 = opts.sealed
    ? 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    : null;
  const envelope: Envelope = {
    id: envelopeId,
    owner_id: '33333333-3333-4333-8333-333333333333',
    title: 'Sample agreement',
    short_code: 'sampleCode013',
    status: opts.sealed ? 'completed' : 'declined',
    delivery_mode: 'parallel',
    original_pages: 2,
    original_sha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    sealed_sha256: sealedSha256,
    sender_email: 'ada@example.com',
    sender_name: opts.senderName,
    sent_at: '2026-03-11T20:59:04.000Z',
    completed_at: opts.sealed ? '2026-03-11T21:21:25.000Z' : null,
    expires_at: '2026-04-11T20:59:03.000Z',
    tc_version: '2026-04-24',
    privacy_version: '2026-04-24',
    reminders_enabled: true,
    signers: [
      {
        id: signerId,
        email: 'sam@example.com',
        name: 'Sam Signer',
        color: '#4F46E5',
        role: 'signatory',
        signing_order: 1,
        status: opts.sealed ? 'completed' : 'declined',
        viewed_at: '2026-03-11T21:20:50.000Z',
        tc_accepted_at: '2026-03-11T21:20:54.000Z',
        signed_at: opts.sealed ? '2026-03-11T21:21:22.000Z' : null,
        declined_at: opts.sealed ? null : '2026-03-11T21:14:22.000Z',
      },
    ],
    fields: [],
    tags: [],
    created_at: '2026-03-11T20:59:03.000Z',
    updated_at: '2026-03-11T21:21:25.000Z',
  };
  const events: EnvelopeEvent[] = [
    {
      id: '44444444-4444-4444-8444-444444444444',
      envelope_id: envelopeId,
      signer_id: null,
      actor_kind: 'sender',
      event_type: 'created',
      ip: '203.0.113.10',
      user_agent: 'Mozilla/5.0',
      metadata: {},
      created_at: '2026-03-11T20:59:03.000Z',
    },
    {
      id: '55555555-5555-4555-8555-555555555555',
      envelope_id: envelopeId,
      signer_id: null,
      actor_kind: 'sender',
      event_type: 'sent',
      ip: '203.0.113.10',
      user_agent: 'Mozilla/5.0',
      metadata: {},
      created_at: '2026-03-11T20:59:04.000Z',
    },
    {
      id: '66666666-6666-4666-8666-666666666666',
      envelope_id: envelopeId,
      signer_id: signerId,
      actor_kind: 'signer',
      event_type: opts.sealed ? 'signed' : 'declined',
      ip: '203.0.113.20',
      user_agent: 'Mozilla/5.0',
      metadata: {},
      created_at: opts.sealed ? '2026-03-11T21:21:22.000Z' : '2026-03-11T21:14:22.000Z',
    },
  ];
  const signerDetails: SignerAuditDetail[] = [
    {
      signer_id: signerId,
      signature_format: 'typed',
      signature_font: 'Caveat',
      verification_checks: ['email'],
      signing_ip: '203.0.113.20',
    },
  ];
  return {
    envelope,
    events,
    signerDetails,
    sealedSha256,
    sealedPages: opts.sealed ? 2 : null,
    cmsSealApplied: opts.cmsSealApplied ?? opts.sealed,
    timestampApplied: opts.timestampApplied ?? opts.cmsSealApplied ?? opts.sealed,
    publicUrl: 'https://seald.example',
  };
}

function extractPdfText(pdf: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), 'audit-pdf-claims-'));
  const pdfPath = join(dir, 'audit.pdf');
  const scriptPath = join(dir, 'extract.mjs');
  const pdfjs = nodeRequire.resolve('pdfjs-dist/legacy/build/pdf.mjs');
  writeFileSync(pdfPath, pdf);
  writeFileSync(
    scriptPath,
    `import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const pdfjs = await import(pathToFileURL(${JSON.stringify(pdfjs)}).href);
const data = new Uint8Array(readFileSync(process.argv[2]));
const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
const parts = [];
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const content = await page.getTextContent();
  parts.push(content.items.map((item) => (item.str ? item.str : '')).join(' '));
}
process.stdout.write(parts.join('\\n'));
`,
  );
  const result = spawnSync(process.execPath, [scriptPath, pdfPath], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  rmSync(dir, { recursive: true, force: true });
  if (result.status !== 0) {
    throw new Error(result.stderr || `pdfjs exited ${result.status ?? 'null'}`);
  }
  return result.stdout;
}

function normalizePdfText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function collectSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectSources(full));
      continue;
    }
    if (entry.endsWith('.spec.ts') || entry.endsWith('.spec.tsx')) continue;
    if (!/\.(tsx?|html|txt)$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}
