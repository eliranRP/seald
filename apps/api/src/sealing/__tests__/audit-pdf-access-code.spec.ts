import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Envelope, EnvelopeEvent, EnvelopeSigner } from '../../envelopes/envelope.entity';
import { buildAuditPdf, type AuditPdfInput } from '../audit-pdf';

const nodeRequire = createRequire(__filename);

/**
 * WP-10: a signer who entered an emailed one-time code gets an "Identity
 * check: emailed one-time code to a***@example.com" row (and a re-check
 * row before signing when that was required), from the hash-chained
 * `access_code_verified` events. The wording never claims the person's
 * identity was verified. A signer without a code gets neither row.
 */
const ENV_ID = '11111111-1111-4111-8111-111111111111';
const ADA = '22222222-2222-4222-8222-222222222221';
const BEA = '22222222-2222-4222-8222-222222222222';

function signer(id: string, name: string, signedAt: string): EnvelopeSigner {
  return {
    id,
    email: `${name.toLowerCase()}@example.com`,
    name,
    color: '#4F46E5',
    role: 'signatory',
    signing_order: 1,
    status: 'completed',
    viewed_at: signedAt,
    tc_accepted_at: signedAt,
    signed_at: signedAt,
    declined_at: null,
  };
}

function event(
  id: string,
  type: EnvelopeEvent['event_type'],
  at: string,
  extra: Partial<EnvelopeEvent> = {},
): EnvelopeEvent {
  return {
    id,
    envelope_id: ENV_ID,
    signer_id: null,
    actor_kind: 'system',
    event_type: type,
    ip: null,
    user_agent: null,
    metadata: {},
    created_at: at,
    ...extra,
  };
}

function input(): AuditPdfInput {
  const envelope: Envelope = {
    id: ENV_ID,
    owner_id: '33333333-3333-4333-8333-333333333333',
    title: 'Coded agreement',
    short_code: 'codedAgree133',
    status: 'completed',
    delivery_mode: 'parallel',
    original_pages: 1,
    original_sha256: 'b'.repeat(64),
    sealed_sha256: 'c'.repeat(64),
    sender_email: 'owner@example.com',
    sender_name: 'Owner',
    sent_at: '2026-03-11T09:00:00.000Z',
    completed_at: '2026-03-12T15:00:00.000Z',
    expires_at: '2026-04-11T09:00:00.000Z',
    tc_version: '2026-04-24',
    privacy_version: '2026-04-24',
    reminders_enabled: true,
    signers: [
      signer(ADA, 'Ada', '2026-03-11T10:30:00.000Z'),
      signer(BEA, 'Bea', '2026-03-11T11:00:00.000Z'),
    ],
    fields: [],
    tags: [],
    created_at: '2026-03-11T08:59:00.000Z',
    updated_at: '2026-03-12T15:00:00.000Z',
  };
  const coded = { signer_id: ADA, actor_kind: 'signer' as const, ip: '203.0.113.9' };
  const events: EnvelopeEvent[] = [
    event('e0000000-0000-4000-8000-000000000001', 'created', '2026-03-11T08:59:00.000Z', {
      actor_kind: 'sender',
    }),
    event('e0000000-0000-4000-8000-000000000002', 'sent', '2026-03-11T09:00:00.000Z'),
    event('e0000000-0000-4000-8000-000000000003', 'access_code_sent', '2026-03-11T10:00:00.000Z', {
      ...coded,
      metadata: { method: 'email_otp', purpose: 'access', to_masked: 'a***@example.com' },
    }),
    event(
      'e0000000-0000-4000-8000-000000000004',
      'access_code_failed',
      '2026-03-11T10:01:00.000Z',
      {
        ...coded,
        metadata: { method: 'email_otp', purpose: 'access', reason: 'mismatch', attempts: 1 },
      },
    ),
    event(
      'e0000000-0000-4000-8000-000000000005',
      'access_code_verified',
      '2026-03-11T10:02:00.000Z',
      {
        ...coded,
        metadata: { method: 'email_otp', purpose: 'access', to_masked: 'a***@example.com' },
      },
    ),
    event(
      'e0000000-0000-4000-8000-000000000006',
      'access_code_verified',
      '2026-03-11T10:29:00.000Z',
      {
        ...coded,
        metadata: { method: 'email_otp', purpose: 'action', to_masked: 'a***@example.com' },
      },
    ),
    event('e0000000-0000-4000-8000-000000000007', 'signed', '2026-03-11T10:30:00.000Z', coded),
    event('e0000000-0000-4000-8000-000000000008', 'signed', '2026-03-11T11:00:00.000Z', {
      signer_id: BEA,
      actor_kind: 'signer',
    }),
  ];
  return {
    envelope,
    events,
    signerDetails: [
      {
        signer_id: ADA,
        signature_format: 'drawn',
        signature_font: null,
        verification_checks: ['email', 'email_otp'],
        signing_ip: null,
      },
      {
        signer_id: BEA,
        signature_format: 'drawn',
        signature_font: null,
        verification_checks: ['email'],
        signing_ip: null,
      },
    ],
    sealedSha256: 'c'.repeat(64),
    sealedPages: 1,
    cmsSealApplied: true,
    timestampApplied: true,
    publicUrl: 'https://seald.example',
  };
}

describe('audit PDF access code (WP-10)', () => {
  let text = '';

  beforeAll(async () => {
    text = extractPdfText(await buildAuditPdf(input()));
  }, 120_000);

  it('prints the emailed one-time code checks for the signer who passed them', () => {
    expect(
      text.match(/Identity check: emailed one-time code to a\*\*\*@example\.com/g),
    ).toHaveLength(1);
    expect(
      text.match(/Re-checked before signing: emailed one-time code to a\*\*\*@example\.com/g),
    ).toHaveLength(1);
    expect(text).toContain('Email code');
    // Bea passed no code: only Ada's card carries the rows.
    expect(text).not.toContain('b***@example.com');
  });

  it('never claims a verified identity', () => {
    expect(text.toLowerCase()).not.toContain('identity verified');
    expect(text.toLowerCase()).not.toContain('verified identity');
  });
});

function extractPdfText(pdf: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), 'audit-pdf-code-'));
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
  return result.stdout.replace(/\s+/g, ' ').trim();
}
