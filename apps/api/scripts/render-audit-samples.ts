/**
 * Operator helper: render the audit PDF for a few representative
 * envelope shapes and drop them into apps/api/test-output/. Used to
 * eyeball alignment / icons / spacing / cut-off issues against the
 * Design-Guide reference (see Design-Guide/project/audit-trail.html
 * and Design-Guide/project/uploads/audit.pdf).
 *
 * Run with: pnpm --filter api ts-node scripts/render-audit-samples.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildAuditPdf } from '../src/sealing/audit-pdf';
import type { Envelope, EnvelopeEvent } from '../src/envelopes/envelope.entity';
import type { SignerAuditDetail } from '../src/envelopes/envelopes.repository';

const OUT_DIR = join(__dirname, '..', 'test-output');
mkdirSync(OUT_DIR, { recursive: true });

const envelopeId = '33b9416b-ad2a-4f83-9cb2-69f87aa1655c';
const signer1Id = '16c9fdef-4785-4d9d-ad95-e47b6ae960b9';
const signer2Id = '2a1b4c7d-9999-4eee-b8a0-444555666777';

const baseEnvelope: Envelope = {
  id: envelopeId,
  owner_id: '0e5e0db9-bb9a-4cc1-9ea3-9cfac3118d69',
  title: 'UNCONDITIONAL FINAL WAIVER — 11.03.2026',
  short_code: 'qyHWxhRGhmzjJ',
  status: 'completed',
  delivery_mode: 'parallel',
  original_pages: 7,
  original_sha256: 'a2e35edd7a531f4928f7f56c4b4e33674a0939f9a120359185e24a0c55f675ee',
  sealed_sha256: '7a8afa33b5b077e0486f08fc301e6865caf7b8ea0ea256505df80ea6034c1261',
  sender_email: 'ops@nromomentum.com',
  sender_name: 'Ops Team',
  sent_at: '2026-03-11T20:59:04.000Z',
  completed_at: '2026-03-11T21:21:25.000Z',
  expires_at: '2026-04-11T20:59:03.000Z',
  tc_version: '2025-08-01',
  privacy_version: '2025-08-01',
  signers: [
    {
      id: signer1Id,
      email: 'bapstarremodelingllc502@gmail.com',
      name: 'Benjamin Antonio Perez',
      color: '#4F46E5',
      role: 'signatory',
      signing_order: 1,
      status: 'completed',
      viewed_at: '2026-03-11T21:20:50.000Z',
      tc_accepted_at: '2026-03-11T21:20:54.000Z',
      signed_at: '2026-03-11T21:21:22.000Z',
      declined_at: null,
    },
    {
      id: signer2Id,
      email: 'agent.smith@example-realty.com',
      name: 'Agent Smith',
      color: '#0EA5E9',
      role: 'signatory',
      signing_order: 2,
      status: 'completed',
      viewed_at: '2026-03-11T21:14:30.000Z',
      tc_accepted_at: '2026-03-11T21:14:38.000Z',
      signed_at: '2026-03-11T21:21:25.000Z',
      declined_at: null,
    },
  ],
  fields: [],
  created_at: '2026-03-11T20:59:03.000Z',
  updated_at: '2026-03-11T21:21:25.000Z',
};

const baseEvents: EnvelopeEvent[] = [
  e('00000000-0001-0000-0000-000000000001', null, 'sender', 'created', '2026-03-11T20:59:03.000Z'),
  e('00000000-0001-0000-0000-000000000002', null, 'sender', 'sent', '2026-03-11T20:59:04.000Z'),
  e(
    '00000000-0001-0000-0000-000000000003',
    signer1Id,
    'signer',
    'viewed',
    '2026-03-11T21:20:50.000Z',
  ),
  e(
    '00000000-0001-0000-0000-000000000004',
    signer1Id,
    'signer',
    'tc_accepted',
    '2026-03-11T21:20:54.000Z',
  ),
  e(
    '00000000-0001-0000-0000-000000000005',
    signer1Id,
    'signer',
    'field_filled',
    '2026-03-11T21:21:00.000Z',
  ),
  e(
    '00000000-0001-0000-0000-000000000006',
    signer1Id,
    'signer',
    'signed',
    '2026-03-11T21:21:22.000Z',
  ),
  e(
    '00000000-0001-0000-0000-000000000007',
    signer2Id,
    'signer',
    'viewed',
    '2026-03-11T21:14:30.000Z',
  ),
  e(
    '00000000-0001-0000-0000-000000000008',
    signer2Id,
    'signer',
    'tc_accepted',
    '2026-03-11T21:14:38.000Z',
  ),
  e(
    '00000000-0001-0000-0000-000000000009',
    signer2Id,
    'signer',
    'signed',
    '2026-03-11T21:21:25.000Z',
  ),
  e(
    '00000000-0001-0000-0000-000000000010',
    null,
    'system',
    'all_signed',
    '2026-03-11T21:21:25.000Z',
  ),
  e('00000000-0001-0000-0000-000000000011', null, 'system', 'sealed', '2026-03-11T21:21:25.000Z'),
];

function e(
  id: string,
  signer_id: string | null,
  actor_kind: 'sender' | 'signer' | 'system',
  event_type: EnvelopeEvent['event_type'],
  created_at: string,
): EnvelopeEvent {
  return {
    id,
    envelope_id: envelopeId,
    signer_id,
    actor_kind,
    event_type,
    ip: actor_kind === 'signer' ? '4.28.55.97' : '200.114.112.140',
    user_agent:
      actor_kind === 'signer'
        ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126'
        : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/16',
    metadata: {},
    created_at,
  };
}

const signerDetails: SignerAuditDetail[] = [
  {
    signer_id: signer1Id,
    signature_format: 'drawn',
    verification_checks: ['email'],
    signing_ip: '4.28.55.97',
  },
  {
    signer_id: signer2Id,
    signature_format: 'typed',
    verification_checks: ['email'],
    signing_ip: '5.10.20.30',
  },
];

async function main(): Promise<void> {
  const PUBLIC = 'https://seald.nromomentum.com';

  // Variant A — completed multi-signer
  const completed = await buildAuditPdf({
    envelope: baseEnvelope,
    events: baseEvents,
    signerDetails,
    sealedSha256: baseEnvelope.sealed_sha256!,
    sealedPages: 9,
    publicUrl: PUBLIC,
    retentionYears: 7,
  });
  const pCompleted = join(OUT_DIR, 'audit-sample-completed.pdf');
  writeFileSync(pCompleted, completed);
  console.log(`wrote ${pCompleted} (${completed.byteLength} bytes)`);

  // Variant B — single signer, completed
  const single: Envelope = {
    ...baseEnvelope,
    signers: [baseEnvelope.signers[0]!],
  };
  const singleEvents = baseEvents.filter(
    (ev) => ev.signer_id !== signer2Id && ev.event_type !== 'all_signed',
  );
  const completedSingle = await buildAuditPdf({
    envelope: single,
    events: singleEvents,
    signerDetails: [signerDetails[0]!],
    sealedSha256: baseEnvelope.sealed_sha256!,
    sealedPages: 9,
    publicUrl: PUBLIC,
    retentionYears: 7,
  });
  const pSingle = join(OUT_DIR, 'audit-sample-single.pdf');
  writeFileSync(pSingle, completedSingle);
  console.log(`wrote ${pSingle} (${completedSingle.byteLength} bytes)`);

  // Variant C — declined
  const declined: Envelope = {
    ...baseEnvelope,
    status: 'declined',
    sealed_sha256: null,
    completed_at: null,
    signers: [
      {
        ...baseEnvelope.signers[0]!,
        status: 'declined',
        signed_at: null,
        declined_at: '2026-03-11T21:21:00.000Z',
      },
      baseEnvelope.signers[1]!,
    ],
  };
  const declinedEvents: EnvelopeEvent[] = [
    ...baseEvents.filter(
      (ev) =>
        ev.event_type !== 'signed' && ev.event_type !== 'all_signed' && ev.event_type !== 'sealed',
    ),
    e(
      '00000000-0001-0000-0000-0000000000ff',
      signer1Id,
      'signer',
      'declined',
      '2026-03-11T21:21:00.000Z',
    ),
  ];
  const declinedBytes = await buildAuditPdf({
    envelope: declined,
    events: declinedEvents,
    signerDetails,
    sealedSha256: null,
    sealedPages: null,
    publicUrl: PUBLIC,
    retentionYears: 7,
  });
  const pDeclined = join(OUT_DIR, 'audit-sample-declined.pdf');
  writeFileSync(pDeclined, declinedBytes);
  console.log(`wrote ${pDeclined} (${declinedBytes.byteLength} bytes)`);

  // Variant D — long title to stress wrap
  const longTitle: Envelope = {
    ...baseEnvelope,
    title:
      'MASTER SERVICES AGREEMENT — Statement of Work #14 — NRO Momentum LLC and Acme Construction Holdings Co. — Phase II Renovation, 2026',
  };
  const longTitleBytes = await buildAuditPdf({
    envelope: longTitle,
    events: baseEvents,
    signerDetails,
    sealedSha256: baseEnvelope.sealed_sha256!,
    sealedPages: 9,
    publicUrl: PUBLIC,
    retentionYears: 7,
  });
  const pLong = join(OUT_DIR, 'audit-sample-long-title.pdf');
  writeFileSync(pLong, longTitleBytes);
  console.log(`wrote ${pLong} (${longTitleBytes.byteLength} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
