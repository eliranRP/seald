import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Envelope, EnvelopeEvent, EnvelopeSigner } from '../../envelopes/envelope.entity';
import { buildAuditPdf, type AuditPdfInput } from '../audit-pdf';

const nodeRequire = createRequire(__filename);

/**
 * WP-05: the certificate of a sequential envelope lists each signer's
 * step and the time that step was invited. A parallel envelope keeps the
 * single "Sent" row it always had.
 */
const ENV_ID = '11111111-1111-4111-8111-111111111111';
const ADA = '22222222-2222-4222-8222-222222222221';
const BEA = '22222222-2222-4222-8222-222222222222';
const CY = '22222222-2222-4222-8222-222222222223';

function signer(id: string, name: string, order: number, signedAt: string): EnvelopeSigner {
  return {
    id,
    email: `${name.toLowerCase()}@example.com`,
    name,
    color: '#4F46E5',
    role: 'signatory',
    signing_order: order,
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

function input(mode: Envelope['delivery_mode']): AuditPdfInput {
  const envelope: Envelope = {
    id: ENV_ID,
    owner_id: '33333333-3333-4333-8333-333333333333',
    title: 'Ordered agreement',
    short_code: 'orderedCode13',
    status: 'completed',
    delivery_mode: mode,
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
      signer(ADA, 'Ada', 1, '2026-03-11T10:00:00.000Z'),
      signer(BEA, 'Bea', 1, '2026-03-11T11:00:00.000Z'),
      signer(CY, 'Cy', 2, '2026-03-12T14:00:00.000Z'),
    ],
    fields: [],
    tags: [],
    created_at: '2026-03-11T08:59:00.000Z',
    updated_at: '2026-03-12T15:00:00.000Z',
  };
  const events: EnvelopeEvent[] = [
    event('e0000000-0000-4000-8000-000000000001', 'created', '2026-03-11T08:59:00.000Z', {
      actor_kind: 'sender',
    }),
    event('e0000000-0000-4000-8000-000000000002', 'step_started', '2026-03-11T09:00:00.000Z', {
      metadata: { step: 1, signing_order: 1, signer_ids: [ADA, BEA] },
    }),
    event('e0000000-0000-4000-8000-000000000003', 'sent', '2026-03-11T09:00:00.000Z', {
      signer_id: ADA,
    }),
    event('e0000000-0000-4000-8000-000000000004', 'sent', '2026-03-11T09:00:00.000Z', {
      signer_id: BEA,
    }),
    event('e0000000-0000-4000-8000-000000000005', 'step_started', '2026-03-11T11:00:01.000Z', {
      metadata: { step: 2, signing_order: 2, signer_ids: [CY] },
    }),
  ];
  return {
    envelope,
    events,
    signerDetails: [],
    sealedSha256: 'c'.repeat(64),
    sealedPages: 1,
    cmsSealApplied: true,
    timestampApplied: true,
    publicUrl: 'https://seald.example',
  };
}

describe('audit PDF signing order (WP-05)', () => {
  let sequential = '';
  let parallel = '';

  beforeAll(async () => {
    sequential = extractPdfText(await buildAuditPdf(input('sequential')));
    parallel = extractPdfText(await buildAuditPdf(input('parallel')));
  }, 120_000);

  it('lists each signer with its step and its invite time', () => {
    expect(sequential).toContain('Sequential');
    expect(sequential.match(/Invited · step 1 of 2/g)).toHaveLength(2);
    expect(sequential.match(/Invited · step 2 of 2/g)).toHaveLength(1);
    expect(sequential).not.toContain('Not invited');
    // Step 2's invite row carries the step_started time (11:00 UTC on the
    // 11th), not the envelope's send time.
    const cyCard = sequential.slice(sequential.indexOf('Invited · step 2 of 2'));
    expect(cyCard).toMatch(/11:00/);
  });

  it('keeps the single Sent row for a parallel envelope', () => {
    expect(parallel).not.toContain('Invited · step');
    expect(parallel).toContain('Sent');
  });
});

function extractPdfText(pdf: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), 'audit-pdf-order-'));
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
